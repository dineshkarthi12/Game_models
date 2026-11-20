import type pg from 'pg';
import { sqlOne, transaction } from '../database/pool.js';
import { PLANS, type Plan } from '../services/plans.js';
import { addTransaction, getBalance } from '../services/credits.js';

export interface PublicUser {
  id: string; email: string; full_name: string | null; avatar_url: string | null; company: string | null; job_title: string | null;
  plan: Plan; credits: number; storage_used_bytes: number; storage_quota_bytes: number; created_at: string; preferences: Record<string, unknown>;
  auth_provider: string;
}

/** Creates profile, free subscription and signup credit grant. Idempotent. */
export async function provisionUser(c: pg.PoolClient, userId: string, fullName: string | null) {
  await c.query(`insert into profiles (user_id, full_name, plan, storage_quota_bytes) values ($1,$2,'free',$3) on conflict (user_id) do nothing`,
    [userId, fullName, PLANS.free.storage_quota_bytes]);
  await c.query(`insert into subscriptions (user_id, plan, status) values ($1,'free','active') on conflict (user_id) do nothing`, [userId]);
  await addTransaction(userId, PLANS.free.signup_credits, 'Welcome credits (Free plan)', `signup:${userId}`, { type: 'user', id: userId }, c);
}

export async function getPublicUser(userId: string): Promise<PublicUser | null> {
  const row = await sqlOne<Omit<PublicUser, 'credits'>>(
    `select u.id, u.email, u.created_at, u.auth_provider, p.full_name, p.avatar_url, p.company, p.job_title, p.plan,
            p.storage_used_bytes, p.storage_quota_bytes, p.preferences
       from users u join profiles p on p.user_id = u.id where u.id = $1`, [userId]);
  if (!row) return null;
  return { ...row, credits: await getBalance(userId) };
}

/** Supabase mode: mirror the Supabase auth user into our users table on first request. */
export async function ensureSupabaseUser(id: string, email: string) {
  const existing = await sqlOne('select id from users where id = $1', [id]);
  if (existing) return;
  await transaction(async (c) => {
    await c.query(`insert into users (id, email, auth_provider, email_verified) values ($1,$2,'supabase',true) on conflict (id) do nothing`, [id, email]);
    await provisionUser(c, id, null);
  });
}
