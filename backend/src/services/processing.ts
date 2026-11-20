import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sql, sqlOne } from '../database/pool.js';
import { storage } from '../storage/index.js';
import { makeWorkDir, materialize, run, workerScript } from '../utils/process.js';
import { createVersionFromFile } from './models.js';
import { notify } from './notifications.js';
import { analyzeDataset } from './datasetAnalysis.js';
import { processAnalyze } from '../jobs/processors/analyze.js';

export type Op = { op: string; [k: string]: unknown };
const FRAME_CHANGING = new Set(['scale', 'place_on_ground']);
const OP_LABEL: Record<string, string> = {
  cleanup: 'Mesh cleanup', smooth: 'Surface smoothing', decimate: 'Polygon reduction', remesh: 'Retopology', normals: 'Normal correction', fill_holes: 'Hole filling',
  scale: 'Scale correction', material: 'Material edit', uv_unwrap: 'UV unwrap', triangulate: 'Triangulate', place_on_ground: 'Place on ground', texture_enhance: 'Texture enhancement',
};

async function setJob(id: string, status: string, extra: Record<string, unknown> = {}) {
  const sets = ['status = $2']; const vals: unknown[] = [id, status];
  for (const [k, v] of Object.entries(extra)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
  if (['succeeded', 'failed'].includes(status)) sets.push('completed_at = now()');
  await sql(`update processing_jobs set ${sets.join(', ')} where id = $1`, vals);
}

/** Runs Blender refinement (+ texture transfer when UVs change) and stores the result as a new version. */
export async function runRefine(opts: { ownerId: string; modelId: string; versionId: string; ops: Op[]; label?: string; extraParams?: Record<string, unknown>;
  isLod?: boolean; lodLevel?: number | null; setCurrent?: boolean; textureSize?: number; work?: string }) {
  const parent = await sqlOne<{ storage_key: string; params: Record<string, unknown>; version: number }>('select storage_key, params, version from model_versions where id = $1', [opts.versionId]);
  if (!parent) throw new Error('Source version not found');
  const work = opts.work ?? await makeWorkDir('refine');
  const src = path.join(work, `src-${parent.version}.glb`);
  if (!(await fs.stat(src).catch(() => null))) await storage.download(parent.storage_key, src);
  const tag = Math.random().toString(36).slice(2, 8);
  const geomOps = opts.ops.filter((o) => o.op !== 'texture_enhance');
  const texOps = opts.ops.filter((o) => o.op === 'texture_enhance');
  const opsPath = path.join(work, `ops-${tag}.json`); await fs.writeFile(opsPath, JSON.stringify(geomOps));
  const raw = path.join(work, `raw-${tag}.glb`); const out = path.join(work, `out-${tag}.glb`);
  const results: unknown[] = []; let done: { uv_changed: boolean; triangles: number } | null = null;
  if (geomOps.length) {
    const r = await run(config.BLENDER_BIN, ['-b', '--factory-startup', '-P', workerScript('model-processing', 'refine.py'), '--', src, raw, opsPath], {
      timeoutMs: 30 * 60_000,
      onLine: (l) => { if (l.startsWith('OPRESULT ')) results.push(JSON.parse(l.slice(9))); if (l.startsWith('REFINE_DONE ')) done = JSON.parse(l.slice(12)); },
    });
    if (r.code !== 0 || !done) throw new Error(`Blender refinement failed: ${(r.stderr || r.stdout).split('\n').filter((x) => /Error|error/.test(x)).slice(-3).join(' ') || r.stderr.slice(-300)}`);
  } else { await fs.copyFile(src, raw); done = { uv_changed: false, triangles: 0 }; }
  let final = raw; let transferred = false;
  if ((done as { uv_changed: boolean }).uv_changed) {
    const t = await run(config.PYTHON_BIN, [workerScript('model-processing', 'transfer_texture.py'), src, raw, out, String(opts.textureSize ?? 2048)], { timeoutMs: 20 * 60_000 });
    if (t.code !== 0) throw new Error(`Texture transfer failed: ${t.stderr.slice(-300)}`);
    final = out; transferred = t.stdout.includes('TRANSFER_OK');
  }
  for (const t of texOps) {
    const enh = path.join(work, `enh-${tag}.glb`);
    const e = await run(config.PYTHON_BIN, [workerScript('model-processing', 'enhance_texture.py'), final, enh, String(t.amount ?? 0.8), String(t.contrast ?? 0.5)], { timeoutMs: 10 * 60_000 });
    if (e.code !== 0) throw new Error(`Texture enhancement failed: ${e.stderr.slice(-300)}`);
    results.push({ op: 'texture_enhance', textures: Number(e.stdout.match(/ENHANCE_OK (\d+)/)?.[1] ?? 0) });
    final = enh;
  }
  const frameChanged = !!parent.params?.frame_changed || opts.ops.some((o) => FRAME_CHANGING.has(o.op));
  const scaled = opts.ops.find((o) => o.op === 'scale' && !o.factor);
  const params = {
    ops: opts.ops, results, texture_transferred: transferred, frame_changed: frameChanged,
    scale_calibrated: scaled ? true : parent.params?.scale_calibrated ?? undefined, unit: scaled ? 'm' : parent.params?.unit,
    ...opts.extraParams,
  };
  const label = opts.label ?? `Refined: ${opts.ops.map((o) => OP_LABEL[o.op] ?? o.op).join(' + ')}`;
  const v = await createVersionFromFile({ ownerId: opts.ownerId, modelId: opts.modelId, filePath: final, label: label.slice(0, 120), operation: opts.isLod ? 'lod' : 'refine',
    parentVersionId: opts.versionId, params, isLod: opts.isLod, lodLevel: opts.lodLevel ?? null, setCurrent: opts.setCurrent });
  if (!opts.work) await fs.rm(work, { recursive: true, force: true });
  return { ...v, results };
}

export async function processRefineJob(data: { jobId: string }) {
  const job = await sqlOne<{ id: string; owner_id: string; model_id: string; version_id: string; params: { ops: Op[]; label?: string } }>('select * from processing_jobs where id = $1', [data.jobId]);
  if (!job || !job.version_id) return;
  await setJob(job.id, 'running');
  try {
    const v = await runRefine({ ownerId: job.owner_id, modelId: job.model_id, versionId: job.version_id, ops: job.params.ops, label: job.params.label });
    await processAnalyze({ modelId: job.model_id, versionId: v.id });
    await setJob(job.id, 'succeeded', { result_version_id: v.id });
    await notify(job.owner_id, 'refine_done', 'Refinement complete', `Version ${v.version} was created.`, `/app/models/${job.model_id}?tab=refine`);
  } catch (e) {
    await setJob(job.id, 'failed', { error: (e as Error).message.slice(0, 1000) });
    throw e;
  }
}

export async function processValidateJob(data: { jobId: string }) {
  const job = await sqlOne<{ id: string; owner_id: string; model_id: string; version_id: string; params: { measurements?: unknown } }>('select * from processing_jobs where id = $1', [data.jobId]);
  if (!job || !job.version_id) return;
  await setJob(job.id, 'running');
  const work = await makeWorkDir('validate');
  try {
    const v = await sqlOne<{ storage_key: string; params: { frame_changed?: boolean } }>('select storage_key, params from model_versions where id = $1', [job.version_id]);
    const meta = await sqlOne<{ stats: { integrity?: unknown } }>('select stats from model_metadata where version_id = $1', [job.version_id]);
    if (!v || !meta) throw new Error('Model statistics are not available yet; try again when analysis has finished.');
    const m = await sqlOne<{ source: string; is_demo: boolean; project_id: string; generation_id: string | null }>('select source, is_demo, project_id, generation_id from models where id = $1', [job.model_id]);
    const gen = m?.generation_id ? await sqlOne<{ metrics: Record<string, unknown>; used_image_ids: string[]; input_image_ids: string[]; cameras_key: string | null }>(
      'select g.metrics, g.used_image_ids, g.input_image_ids, r.cameras_key from generations g left join reconstruction_jobs r on r.generation_id = g.id where g.id = $1', [m.generation_id]) : null;
    const glb = path.join(work, 'model.glb'); await storage.download(v.storage_key, glb);
    const projectImgs = await sql<{ id: string; storage_key: string; angle: string; dhash: string; sha256: string; quality: never }>(
      'select id, storage_key, angle, dhash, sha256, quality from project_images where project_id = $1 order by sort_order', [m!.project_id]);
    // Reference views: images actually used (or canonical views when none were used, e.g. demo).
    const used = new Set(gen?.used_image_ids ?? []);
    const canonical = ['front', 'back', 'left', 'right', 'top', 'front_left', 'front_right', 'back_left', 'back_right'];
    let refs = projectImgs.filter((i) => used.has(i.id));
    if (!refs.length) refs = projectImgs.filter((i) => canonical.includes(i.angle));
    refs = [...refs].sort((a, b) => canonical.indexOf(a.angle) - canonical.indexOf(b.angle)).slice(0, 8);
    const references = await Promise.all(refs.map(async (i) => ({ id: i.id, angle: i.angle, path: await materialize(i.storage_key, work) })));
    let cameras = null;
    if (m!.source === 'photogrammetry' && gen?.cameras_key && !v.params?.frame_changed) {
      const cp = path.join(work, 'cameras.json'); await storage.download(gen.cameras_key, cp); cameras = JSON.parse(await fs.readFile(cp, 'utf8'));
    }
    const stats = meta.stats as Record<string, unknown> & { integrity?: unknown };
    const cfg = {
      glb, source: m!.source, is_demo: m!.is_demo, stats, integrity: stats.integrity, metrics: gen?.metrics ?? {}, references, cameras,
      measurements: job.params.measurements ?? null, coverage_ratio: analyzeDataset(projectImgs, null).coverage_ratio,
      used_images: gen?.used_image_ids?.length ?? 0, input_images: gen?.input_image_ids?.length ?? 0,
    };
    const cfgPath = path.join(work, 'validate.json'); await fs.writeFile(cfgPath, JSON.stringify(cfg));
    const r = await run(config.PYTHON_BIN, [workerScript('model-processing', 'validate.py'), cfgPath], { timeoutMs: 15 * 60_000 });
    if (r.code !== 0) throw new Error(`Validation failed: ${r.stderr.slice(-400)}`);
    const report = JSON.parse(r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop()!);
    report.measurements = job.params.measurements ?? null;
    const row = await sqlOne<{ id: string }>('insert into validation_reports (model_id, version_id, owner_id, report) values ($1,$2,$3,$4) returning id', [job.model_id, job.version_id, job.owner_id, JSON.stringify(report)]);
    await setJob(job.id, 'succeeded', { params: JSON.stringify({ ...job.params, report_id: row!.id }) });
  } catch (e) {
    await setJob(job.id, 'failed', { error: (e as Error).message.slice(0, 1000) });
    throw e;
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}
