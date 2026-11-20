import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sql, sqlOne } from '../database/pool.js';
import { storage, keys } from '../storage/index.js';
import { makeWorkDir, materialize, run, workerScript } from '../utils/process.js';
import { addEvent, failGeneration, isCancelled, refreshProjectStatus } from '../services/generations.js';
import { createVersionFromFile } from '../services/models.js';
import { enqueue } from '../jobs/queues.js';
import { logger } from '../utils/logger.js';

const TEXTURE: Record<string, number> = { draft: 1024, standard: 2048, high: 4096, ultra: 4096 };
const RECON_COLUMNS: Record<string, string> = {
  registered_images: 'registered_images', total_images: 'total_images', sparse_points: 'sparse_points',
  mean_reprojection_error: 'mean_reprojection_error', mean_track_length: 'mean_track_length', dense_mode: 'dense_mode',
  mesh_vertices: 'mesh_vertices', mesh_faces: 'mesh_faces', scale_factor: 'scale_factor', scale_source: 'scale_source',
};

async function hasCuda() {
  const r = await run(config.COLMAP_BIN, ['help'], { timeoutMs: 15_000 }).catch(() => null);
  return !!r && /with CUDA/.test(r.stdout + r.stderr);
}

async function mergeMetrics(genId: string, m: Record<string, unknown>) {
  await sql(`update generations set metrics = metrics || $2::jsonb where id = $1`, [genId, JSON.stringify(m)]);
  const sets: string[] = []; const vals: unknown[] = [genId];
  for (const [k, col] of Object.entries(RECON_COLUMNS)) if (m[k] !== undefined && m[k] !== null) { vals.push(m[k]); sets.push(`${col} = $${vals.length}`); }
  vals.push(JSON.stringify(m)); sets.push(`metrics = metrics || $${vals.length}::jsonb`);
  await sql(`update reconstruction_jobs set ${sets.join(', ')} where generation_id = $1`, vals);
}

/** Photogrammetry processor: runs workers/photogrammetry/pipeline.py and mirrors its real stage/metric events. */
export async function processReconstruction(data: { generationId: string }) {
  const gen = await sqlOne<{ id: string; owner_id: string; project_id: string; status: string; settings: Record<string, unknown>; input_image_ids: string[] }>(
    'select * from generations where id = $1', [data.generationId]);
  if (!gen || gen.status !== 'queued') return;
  await sql(`update generations set status = 'running', started_at = now() where id = $1`, [gen.id]);
  await sql(`update reconstruction_jobs set status = 'running' where generation_id = $1`, [gen.id]);
  await refreshProjectStatus(gen.project_id);
  const work = await makeWorkDir('pg');
  const ctrl = new AbortController();
  const watcher = setInterval(() => { void isCancelled(gen.id).then((c) => { if (c) ctrl.abort(); }); }, 2000);
  try {
    await addEvent(gen.id, 'validating', `Preparing ${gen.input_image_ids.length} images`);
    const rows = await sql<{ id: string; storage_key: string; angle: string }>('select id, storage_key, angle from project_images where id = any($1::uuid[]) order by sort_order', [gen.input_image_ids]);
    if (rows.length < 3) return failGeneration(gen.id, 'At least 3 images are required for photogrammetry');
    const images = await Promise.all(rows.map(async (r) => ({ id: r.id, path: await materialize(r.storage_key, work), angle: r.angle })));
    const s = gen.settings as { quality?: string; max_image_size?: number; matcher?: string; known_dimension?: unknown };
    const cuda = await hasCuda();
    const cfg = {
      work_dir: path.join(work, 'run'), images, colmap_bin: config.COLMAP_BIN, blender_bin: config.BLENDER_BIN, threads: 4, cuda,
      quality: s.quality ?? 'standard', max_image_size: s.max_image_size ?? 1600, matcher: s.matcher ?? 'exhaustive',
      known_dimension: s.known_dimension ?? null, texture_size: TEXTURE[s.quality ?? 'standard'] ?? 2048, remove_ground: true,
    };
    await sql(`update reconstruction_jobs set colmap_version = '3.9', dense_mode = $2 where generation_id = $1`, [gen.id, cuda ? 'colmap_patch_match' : 'cpu_sgbm_fusion']);
    const cfgPath = path.join(work, 'config.json'); await fs.writeFile(cfgPath, JSON.stringify(cfg));

    let result: { glb: string; pointcloud: string; cameras: string; log: string; metrics: Record<string, unknown> } | null = null;
    let pipelineError: string | null = null;
    const pending: Promise<unknown>[] = [];
    const r = await run(config.PYTHON_BIN, [workerScript('photogrammetry', 'pipeline.py'), cfgPath], {
      timeoutMs: 2 * 60 * 60 * 1000, signal: ctrl.signal, processGroup: true,
      onLine: (line) => {
        if (!line.startsWith('{')) return; // libraries occasionally print plain text
        let ev: { event: string; stage?: string; message?: string; [k: string]: unknown };
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.event === 'stage') {
          pending.push(addEvent(gen.id, ev.stage!, ev.message ?? ev.stage!));
          pending.push(sql('update reconstruction_jobs set stage = $2 where generation_id = $1', [gen.id, ev.stage]));
        } else if (ev.event === 'metrics') { const { event: _e, ...m } = ev; pending.push(mergeMetrics(gen.id, m)); }
        else if (ev.event === 'warning') pending.push(addEvent(gen.id, null, ev.message ?? 'warning', 'warning'));
        else if (ev.event === 'error') pipelineError = ev.message ?? 'Pipeline error';
        else if (ev.event === 'result') result = ev as never;
      },
    });
    await Promise.all(pending);
    // Keep the processing log with the job regardless of outcome.
    const logPath = path.join(cfg.work_dir, 'pipeline.log');
    if (await fs.stat(logPath).catch(() => null)) {
      const lk = keys.reconstructionLog(gen.owner_id, gen.id);
      await storage.putFile(lk, logPath, 'text/plain');
      await sql('update reconstruction_jobs set log_key = $2 where generation_id = $1', [gen.id, lk]);
    }
    if (r.killed && ctrl.signal.aborted) { await sql(`update reconstruction_jobs set status = 'cancelled' where generation_id = $1`, [gen.id]); return; }
    if (r.timedOut) return failGeneration(gen.id, 'Reconstruction exceeded the 2 hour limit');
    if (!result || r.code !== 0) {
      await sql(`update reconstruction_jobs set status = 'failed' where generation_id = $1`, [gen.id]);
      return failGeneration(gen.id, pipelineError ?? `Pipeline exited with code ${r.code}`);
    }
    const res = result as { glb: string; pointcloud: string; cameras: string; metrics: Record<string, unknown> };
    await mergeMetrics(gen.id, res.metrics);

    const project = await sqlOne<{ name: string; category: string }>('select name, category from projects where id = $1', [gen.project_id]);
    const model = await sqlOne<{ id: string }>(
      `insert into models (owner_id, project_id, generation_id, name, category, source, provider, status) values ($1,$2,$3,$4,$5,'photogrammetry','colmap','processing') returning id`,
      [gen.owner_id, gen.project_id, gen.id, `${project?.name ?? 'Scan'} (photogrammetry)`, (gen.settings.category as string) ?? project?.category ?? 'custom']);
    const m = res.metrics;
    const v = await createVersionFromFile({ ownerId: gen.owner_id, modelId: model!.id, filePath: res.glb, label: 'Photogrammetry reconstruction', operation: 'reconstruct',
      params: { dense_mode: m.dense_mode, scale_calibrated: m.scale_calibrated, scale_factor: m.scale_factor, scale_source: m.scale_source, unit: m.unit } });
    const pcKey = keys.modelFile(gen.owner_id, model!.id, v.version, 'pointcloud.glb');
    const camKey = keys.modelFile(gen.owner_id, model!.id, v.version, 'cameras.json');
    await storage.putFile(pcKey, res.pointcloud, 'model/gltf-binary');
    await storage.putFile(camKey, res.cameras, 'application/json');
    await sql(`update reconstruction_jobs set status = 'succeeded', stage = 'completed', point_cloud_key = $2, cameras_key = $3, model_id = $4 where generation_id = $1`, [gen.id, pcKey, camKey, model!.id]);
    await sql(`update generations set status = 'succeeded', model_id = $2, completed_at = now(), stage = 'completed', used_image_ids = $3 where id = $1`,
      [gen.id, model!.id, (m.registered_image_ids as string[]) ?? []]);
    await addEvent(gen.id, 'completed', `Reconstruction complete: ${m.registered_images}/${m.total_images} images registered, ${m.mesh_faces} triangles`);
    await enqueue('processing', 'analyze', { modelId: model!.id, versionId: v.id, generationId: gen.id });
    await refreshProjectStatus(gen.project_id);
  } catch (e) {
    logger.error({ err: e, genId: gen.id }, 'reconstruction error');
    await failGeneration(gen.id, (e as Error).message);
  } finally {
    clearInterval(watcher);
    await fs.rm(work, { recursive: true, force: true });
  }
}
