import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sql, sqlOne } from '../database/pool.js';
import { storage, keys } from '../storage/index.js';
import { makeWorkDir, run, workerScript } from '../utils/process.js';
import { runRefine, type Op } from './processing.js';
import { processAnalyze } from '../jobs/processors/analyze.js';
import { notify } from './notifications.js';

export const GAME_PRESETS = {
  unreal_hero: { name: 'Unreal Engine — hero asset', engine: 'unreal', budget: 30000, texture: 2048, lods: [1, 0.5, 0.25, 0.1], collision: 'convex', normal_map: true },
  unreal_prop: { name: 'Unreal Engine — prop', engine: 'unreal', budget: 8000, texture: 1024, lods: [1, 0.5, 0.25], collision: 'convex', normal_map: true },
  unity_prop: { name: 'Unity — prop', engine: 'unity', budget: 10000, texture: 2048, lods: [1, 0.5, 0.25], collision: 'convex', normal_map: true },
  godot: { name: 'Godot', engine: 'godot', budget: 10000, texture: 1024, lods: [1, 0.5, 0.25], collision: 'convex', normal_map: true },
  mobile: { name: 'Mobile / VR', engine: 'generic', budget: 3000, texture: 1024, lods: [1, 0.5], collision: 'box', normal_map: true },
} as const;
export type GameSettings = { preset: string; budget: number; texture: number; lods: number[]; collision: 'convex' | 'box' | 'none'; normal_map: boolean; retopology: boolean };

async function bakeNormals(high: string, low: string, size: number, work: string) {
  const out = path.join(work, `nm-${Math.random().toString(36).slice(2, 8)}.glb`);
  const r = await run(config.PYTHON_BIN, [workerScript('model-processing', 'bake_normals.py'), high, low, out, String(size)], { timeoutMs: 30 * 60_000 });
  if (r.code !== 0) throw new Error(`Normal map bake failed: ${r.stderr.slice(-300)}`);
  return out;
}

export async function processOptimizeJob(data: { jobId: string }) {
  const job = await sqlOne<{ id: string; owner_id: string; model_id: string; version_id: string; params: GameSettings }>('select * from processing_jobs where id = $1', [data.jobId]);
  if (!job) return;
  await sql(`update processing_jobs set status = 'running' where id = $1`, [job.id]);
  const work = await makeWorkDir('game');
  const s = job.params;
  try {
    const src = await sqlOne<{ storage_key: string; version: number; params: { scale_calibrated?: boolean } }>('select storage_key, version, params from model_versions where id = $1', [job.version_id]);
    const meta = await sqlOne<{ stats: { triangles: number; has_uvs: boolean; scale_calibrated?: boolean; integrity?: { boundary_edges: number; non_manifold_edges: number } } }>('select stats from model_metadata where version_id = $1', [job.version_id]);
    if (!src || !meta) throw new Error('Source version statistics not available yet');
    const highPath = path.join(work, 'high.glb'); await storage.download(src.storage_key, highPath);

    // LOD0: cleanup → (optional retopology) → reduce to budget → normals; textures re-projected from the source.
    const ops: Op[] = [{ op: 'cleanup' }];
    if (s.retopology) ops.push({ op: 'fill_holes', max_sides: 0 }, { op: 'remesh', resolution: 260 });
    if (meta.stats.triangles > s.budget || s.retopology) ops.push({ op: 'decimate', target_triangles: s.budget });
    else if (!meta.stats.has_uvs) ops.push({ op: 'uv_unwrap' });
    ops.push({ op: 'normals' });
    const presetName = (GAME_PRESETS as Record<string, { name: string }>)[s.preset]?.name ?? 'Custom';
    const lod0 = await runRefine({
      ownerId: job.owner_id, modelId: job.model_id, versionId: job.version_id, ops, textureSize: s.texture, isLod: true, lodLevel: 0, setCurrent: true,
      label: `Game-ready LOD0 · ${presetName}`, extraParams: { game: s },
      postProcess: s.normal_map ? (final) => bakeNormals(highPath, final, s.texture, work) : undefined,
    });
    const lod0Row = await sqlOne<{ storage_key: string }>('select storage_key from model_versions where id = $1', [lod0.id]);
    const lod0Path = path.join(work, 'lod0.glb'); await storage.download(lod0Row!.storage_key, lod0Path);

    // LOD chain from LOD0 (each LOD gets its own UVs, texture and normal map from the high-poly source).
    const lodIds: string[] = [];
    const lod0Tris = Math.min(s.budget, meta.stats.triangles);
    for (const [i, ratio] of s.lods.slice(1).entries()) {
      const v = await runRefine({
        ownerId: job.owner_id, modelId: job.model_id, versionId: lod0.id, ops: [{ op: 'decimate', target_triangles: Math.max(100, Math.round(lod0Tris * ratio)) }],
        textureSize: Math.max(256, s.texture / 2 ** (i + 1)), isLod: true, lodLevel: i + 1, setCurrent: false, label: `LOD${i + 1} · ${Math.round(ratio * 100)}%`,
        postProcess: s.normal_map ? (final) => bakeNormals(highPath, final, Math.max(256, s.texture / 2 ** (i + 1)), work) : undefined,
      });
      lodIds.push(v.id);
    }

    // Collision mesh stored next to LOD0.
    let collision: Record<string, unknown> | null = null;
    if (s.collision !== 'none') {
      const cp = path.join(work, 'collision.glb');
      const r = await run(config.PYTHON_BIN, [workerScript('model-processing', 'collision.py'), lod0Path, cp, s.collision, '128'], { timeoutMs: 10 * 60_000 });
      const line = r.stdout.split('\n').find((l) => l.startsWith('COLLISION_OK '));
      if (r.code === 0 && line) {
        const ck = keys.modelFile(job.owner_id, job.model_id, lod0.version, 'collision.glb');
        await storage.putFile(ck, cp, 'model/gltf-binary');
        collision = { ...JSON.parse(line.slice(13)), key: ck };
      }
    }

    // Readiness checks on LOD0.
    const gcfg = path.join(work, 'gc.json');
    await fs.writeFile(gcfg, JSON.stringify({ budget: s.budget, max_texture: s.texture, scale_calibrated: !!(src.params?.scale_calibrated ?? meta.stats.scale_calibrated), lods: s.lods.length, collision: collision ? s.collision : null }));
    const gc = await run(config.PYTHON_BIN, [workerScript('model-processing', 'game_check.py'), lod0Path, gcfg], { timeoutMs: 10 * 60_000 });
    if (gc.code !== 0) throw new Error(`Game readiness check failed: ${gc.stderr.slice(-300)}`);
    const report = JSON.parse(gc.stdout.trim().split('\n').pop()!);
    await sql(`update model_versions set params = params || $2::jsonb where id = $1`, [lod0.id, JSON.stringify({ collision, game_ready_report: report, lod_versions: lodIds })]);
    await sql('update models set game_ready = $2 where id = $1', [job.model_id, report.game_ready]);
    for (const vid of [lod0.id, ...lodIds]) await processAnalyze({ modelId: job.model_id, versionId: vid, thumbnail: vid === lod0.id });
    await sql(`update processing_jobs set status = 'succeeded', result_version_id = $2, completed_at = now(), params = params || $3::jsonb where id = $1`,
      [job.id, lod0.id, JSON.stringify({ report, lod_versions: lodIds, collision })]);
    await notify(job.owner_id, 'optimize_done', report.game_ready ? 'Game-ready asset created' : 'Optimisation finished with issues',
      `${presetName}: LOD0 + ${lodIds.length} LOD(s).`, `/app/models/${job.model_id}/optimize`);
  } catch (e) {
    await sql(`update processing_jobs set status = 'failed', error = $2, completed_at = now() where id = $1`, [job.id, (e as Error).message.slice(0, 1000)]);
    throw e;
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}
