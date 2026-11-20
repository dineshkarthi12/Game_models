import { sql, sqlOne } from '../database/pool.js';
import { AppError } from '../utils/errors.js';

/** Recompute a user's storage usage from the authoritative tables. */
export async function recalcStorage(userId: string): Promise<number> {
  const r = await sqlOne<{ total: number }>(`
    select (coalesce((select sum(size_bytes) from project_images where owner_id = $1),0)
          + coalesce((select sum(file_size) from model_versions where owner_id = $1),0)
          + coalesce((select sum(package_size) from export_jobs where owner_id = $1),0))::bigint as total`, [userId]);
  const total = Number(r?.total ?? 0);
  await sql('update profiles set storage_used_bytes = $1 where user_id = $2', [total, userId]);
  return total;
}

export async function assertQuota(userId: string, incomingBytes: number) {
  const p = await sqlOne<{ used: number; quota: number }>('select storage_used_bytes as used, storage_quota_bytes as quota from profiles where user_id = $1', [userId]);
  if (p && p.used + incomingBytes > p.quota) {
    throw new AppError(413, 'storage_quota_exceeded', 'Storage quota exceeded. Delete unused assets or upgrade your plan.', { used: p.used, quota: p.quota });
  }
}
