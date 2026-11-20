import { sql, sqlOne } from '../database/pool.js';
import { refundCharge } from './credits.js';
import { notify } from './notifications.js';
import { logger } from '../utils/logger.js';

export type Level = 'info' | 'warning' | 'error';

export async function addEvent(genId: string, stage: string | null, message: string, level: Level = 'info', data?: Record<string, unknown>) {
  const ev = { at: new Date().toISOString(), stage: stage ?? 'info', message, level, ...(data ? { data } : {}) };
  await sql(`update generations set events = events || $2::jsonb, stage = coalesce($3, stage) where id = $1`, [genId, JSON.stringify([ev]), stage]);
}

export async function setProgress(genId: string, progress: number | null, source: string | null) {
  await sql('update generations set progress = $2, progress_source = $3 where id = $1', [genId, progress, source]);
}

export async function isCancelled(genId: string) {
  const r = await sqlOne<{ status: string }>('select status from generations where id = $1', [genId]);
  return !r || r.status === 'cancelled';
}

export async function refreshProjectStatus(projectId: string) {
  await sql(`update projects p set status = case
      when exists (select 1 from generations g where g.project_id = p.id and g.status in ('queued','running')) then 'processing'
      when exists (select 1 from models m where m.project_id = p.id and m.status = 'ready') then 'completed'
      when exists (select 1 from generations g where g.project_id = p.id and g.status = 'failed')
       and not exists (select 1 from generations g where g.project_id = p.id and g.status = 'succeeded') then 'failed'
      else 'draft' end
    where p.id = $1`, [projectId]);
}

/** Mark failed (idempotent), refund credits exactly once and notify. */
export async function failGeneration(genId: string, error: string) {
  const g = await sqlOne<{ owner_id: string; project_id: string; status: string; mode: string }>(
    `update generations set status = 'failed', error = $2, completed_at = now(), progress = null
     where id = $1 and status in ('queued','running') returning owner_id, project_id, status, mode`, [genId, error.slice(0, 2000)]);
  if (!g) return;
  await addEvent(genId, 'failed', error, 'error');
  const refunded = await refundCharge(g.owner_id, `gen:${genId}:charge`, `gen:${genId}:refund`, 'Refund: generation failed');
  if (refunded) await addEvent(genId, null, 'Credits refunded', 'info');
  await refreshProjectStatus(g.project_id);
  await notify(g.owner_id, 'generation_failed', g.mode === 'ai' ? 'AI generation failed' : 'Photogrammetry reconstruction failed', error.slice(0, 300), `/app/jobs/${genId}`);
  logger.warn({ genId, error }, 'generation failed');
}

export async function cancelGeneration(genId: string, ownerId: string) {
  const g = await sqlOne<{ project_id: string }>(
    `update generations set status = 'cancelled', completed_at = now(), progress = null where id = $1 and owner_id = $2 and status in ('queued','running') returning project_id`, [genId, ownerId]);
  if (!g) return false;
  await addEvent(genId, 'cancelled', 'Cancelled by user', 'warning');
  if (await refundCharge(ownerId, `gen:${genId}:charge`, `gen:${genId}:refund`, 'Refund: generation cancelled')) await addEvent(genId, null, 'Credits refunded');
  await refreshProjectStatus(g.project_id);
  return true;
}
