import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sql } from '../database/pool.js';
import { queue, redis, QUEUE_NAMES } from '../jobs/queues.js';
import { failGeneration } from './generations.js';
import { addTransaction } from './credits.js';
import { PLANS, type Plan } from './plans.js';
import { logger } from '../utils/logger.js';
import { run } from '../utils/process.js';

/**
 * Error recovery: jobs marked running whose queue job no longer exists or is not active (e.g. after a worker crash)
 * are failed (with refund) so users are never left waiting forever. AI generations are left alone while their
 * BullMQ job is active or waiting for a retry, because they resume the provider task.
 */
export async function reapStuckJobs() {
  const gens = await sql<{ id: string; mode: string; started_at: string }>(`select id, mode, started_at from generations where status in ('queued','running') and created_at < now() - interval '10 minutes'`);
  let reaped = 0;
  for (const g of gens) {
    const q = queue(g.mode === 'ai' ? 'ai' : 'photogrammetry');
    const job = await q.getJob(g.mode === 'ai' ? `gen-${g.id}` : `recon-${g.id}`);
    const state = job ? await job.getState() : 'missing';
    if (['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'].includes(state)) continue;
    await failGeneration(g.id, `Processing was interrupted (worker state: ${state}). Credits have been refunded; please try again.`);
    reaped++;
  }
  const p = await sql(`update processing_jobs set status = 'failed', error = 'Interrupted: worker stopped while processing', completed_at = now()
    where status in ('queued','running') and created_at < now() - interval '3 hours' returning id`);
  const e = await sql(`update export_jobs set status = 'failed', error = 'Interrupted: worker stopped while exporting', completed_at = now()
    where status in ('queued','running') and created_at < now() - interval '3 hours' returning id`);
  if (reaped || p.length || e.length) logger.warn({ generations: reaped, processing: p.length, exports: e.length }, 'reaped stuck jobs');
  return { generations: reaped, processing: p.length, exports: e.length };
}

/** Monthly plan credits, applied at most once per user per calendar month (idempotency key). */
export async function grantMonthlyCredits(now = new Date()) {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const users = await sql<{ user_id: string; plan: Plan; created_at: string }>('select user_id, plan, created_at from profiles');
  let granted = 0;
  for (const u of users) {
    const created = new Date(u.created_at);
    if (created.getUTCFullYear() === now.getUTCFullYear() && created.getUTCMonth() === now.getUTCMonth() && u.plan === 'free') continue; // signup grant covers the first month
    if (await addTransaction(u.user_id, PLANS[u.plan].monthly_credits, `Monthly credits (${PLANS[u.plan].name})`, `monthly:${u.user_id}:${month}`, { type: 'plan' })) granted++;
  }
  return { month, granted };
}

export async function cleanWorkDirs(maxAgeHours = 24) {
  const dirs = await fs.readdir(config.WORK_DIR).catch(() => [] as string[]);
  let removed = 0;
  for (const d of dirs) {
    const p = path.join(config.WORK_DIR, d);
    const st = await fs.stat(p).catch(() => null);
    if (st && Date.now() - st.mtimeMs > maxAgeHours * 3600_000) { await fs.rm(p, { recursive: true, force: true }); removed++; }
  }
  return removed;
}

let gpuCache: { at: number; value: unknown } | null = null;
async function gpuInfo() {
  if (gpuCache && Date.now() - gpuCache.at < 60_000) return gpuCache.value;
  const r = await run('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { timeoutMs: 5000 }).catch(() => null);
  const value = r && r.code === 0 ? r.stdout.trim().split('\n').map((l) => { const [name, util, used, total] = l.split(',').map((s) => s.trim()); return { name, utilization: +util!, memory_used_mb: +used!, memory_total_mb: +total! }; }) : [];
  gpuCache = { at: Date.now(), value }; return value;
}

/** Worker heartbeat with real resource figures, read by /api/system/metrics. */
export async function publishHeartbeat(workerId: string) {
  const mem = process.memoryUsage();
  const hb = {
    worker: workerId, host: os.hostname(), pid: process.pid, at: new Date().toISOString(), cpus: os.cpus().length, load: os.loadavg(),
    system_memory: { total: os.totalmem(), free: os.freemem() }, process_rss: mem.rss, gpus: await gpuInfo(), uptime_s: Math.round(process.uptime()),
  };
  await redis().set(`vistora:heartbeat:${workerId}`, JSON.stringify(hb), 'EX', 60);
}

export async function systemMetrics() {
  const keys = await redis().keys('vistora:heartbeat:*');
  const workers = (await Promise.all(keys.map((k) => redis().get(k)))).filter(Boolean).map((s) => JSON.parse(s!));
  const queues: Record<string, unknown> = {};
  for (const k of Object.keys(QUEUE_NAMES) as (keyof typeof QUEUE_NAMES)[]) queues[QUEUE_NAMES[k]] = await queue(k).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  return { workers, queues, api: { pid: process.pid, rss: process.memoryUsage().rss, uptime_s: Math.round(process.uptime()), load: os.loadavg() } };
}
