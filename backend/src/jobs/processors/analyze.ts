import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { sql, sqlOne } from '../../database/pool.js';
import { storage, keys } from '../../storage/index.js';
import { makeWorkDir, run, workerScript } from '../../utils/process.js';
import { notify } from '../../services/notifications.js';
import { refreshProjectStatus } from '../../services/generations.js';
import { recalcStorage } from '../../services/storageUsage.js';

export async function analyzeGlb(glbPath: string) {
  const r = await run(config.PYTHON_BIN, [workerScript('model-processing', 'analyze.py'), glbPath], { timeoutMs: 300_000 });
  if (r.code !== 0) throw new Error(`Model analysis failed: ${r.stderr.slice(-500)}`);
  const out = JSON.parse(r.stdout);
  if (out.error) throw new Error(out.error);
  return out as { stats: Record<string, unknown> & { textures: { name: string; width: number; height: number; mime: string; role?: string }[] }; integrity: Record<string, unknown> };
}

export async function renderThumbnail(glbPath: string, outPng: string, view = 'iso', size = 512) {
  const r = await run(config.BLENDER_BIN, ['-b', '--factory-startup', '-P', workerScript('model-processing', 'thumbnail.py'), '--', glbPath, outPng, String(size), view], { timeoutMs: 180_000 });
  if (r.code !== 0 || !r.stdout.includes('THUMB_OK')) throw new Error(`Thumbnail render failed: ${(r.stderr || r.stdout).slice(-400)}`);
}

/** Analyse a stored version: real statistics, integrity, texture list, thumbnail. Marks the model ready. */
export async function processAnalyze(data: { modelId: string; versionId: string; generationId?: string; thumbnail?: boolean }) {
  const v = await sqlOne<{ storage_key: string; owner_id: string; model_id: string }>('select storage_key, owner_id, model_id from model_versions where id = $1', [data.versionId]);
  if (!v) return;
  const work = await makeWorkDir('analyze');
  try {
    const glb = path.join(work, 'model.glb');
    await storage.download(v.storage_key, glb);
    const { stats, integrity } = await analyzeGlb(glb);
    const prev = await sqlOne<{ stats: { scale_calibrated?: boolean; unit?: string; scale?: unknown } }>(
      'select md.stats from model_versions mv join model_metadata md on md.version_id = mv.parent_version_id where mv.id = $1', [data.versionId]);
    const full = { ...stats, integrity, scale_calibrated: prev?.stats?.scale_calibrated ?? false };
    await sql(`insert into model_metadata (version_id, owner_id, stats) values ($1,$2,$3)
               on conflict (version_id) do update set stats = excluded.stats, analyzed_at = now()`, [data.versionId, v.owner_id, JSON.stringify(full)]);
    await sql('delete from model_textures where version_id = $1', [data.versionId]);
    for (const t of stats.textures) {
      await sql('insert into model_textures (version_id, owner_id, name, map_type, width, height, mime_type) values ($1,$2,$3,$4,$5,$6,$7)',
        [data.versionId, v.owner_id, t.name, t.role ?? null, t.width, t.height, t.mime]);
    }
    const isCurrent = await sqlOne('select 1 from models where id = $1 and current_version_id = $2', [data.modelId, data.versionId]);
    if (data.thumbnail !== false && isCurrent) {
      const png = path.join(work, 'thumb.png');
      try {
        await renderThumbnail(glb, png);
        const tk = keys.modelThumb(v.owner_id, data.modelId);
        await storage.putFile(tk, png, 'image/png');
        await sql('update models set thumbnail_key = $1 where id = $2', [tk, data.modelId]);
      } catch { /* thumbnail is optional; analysis results stand */ }
    }
    const m = await sqlOne<{ status: string; name: string; project_id: string }>(`update models set status = 'ready' where id = $1 returning status, name, project_id`, [data.modelId]);
    if (m) await refreshProjectStatus(m.project_id);
    await recalcStorage(v.owner_id);
    if (data.generationId) await notify(v.owner_id, 'model_ready', 'Model ready', `${m?.name ?? 'Your model'} is ready to inspect.`, `/app/models/${data.modelId}`);
  } catch (e) {
    await sql(`update models set status = case when status = 'processing' then 'failed' else status end where id = $1`, [data.modelId]);
    throw e;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
