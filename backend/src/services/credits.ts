import type pg from 'pg';
import { pool, sqlOne } from '../database/pool.js';
import { paymentRequired } from '../utils/errors.js';

export async function getBalance(userId: string, q: pg.Pool | pg.PoolClient = pool): Promise<number> {
  const r = await q.query<{ balance: number }>('select coalesce(sum(amount),0)::int as balance from credit_transactions where user_id = $1', [userId]);
  return r.rows[0]?.balance ?? 0;
}

/**
 * Append a ledger entry. The UNIQUE idempotency_key guarantees a given charge/refund/grant is applied at most once.
 * Returns true if a new row was written.
 */
export async function addTransaction(userId: string, amount: number, reason: string, idempotencyKey: string,
  ref: { type?: string; id?: string } = {}, q: pg.Pool | pg.PoolClient = pool): Promise<boolean> {
  if (amount === 0) return false;
  const r = await q.query(
    `insert into credit_transactions (user_id, amount, reason, reference_type, reference_id, idempotency_key)
     values ($1,$2,$3,$4,$5,$6) on conflict (idempotency_key) do nothing`,
    [userId, amount, reason, ref.type ?? null, ref.id ?? null, idempotencyKey]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Charge credits atomically: serialises per user with an advisory lock so concurrent requests cannot overdraw.
 */
export async function charge(userId: string, amount: number, reason: string, idempotencyKey: string, ref: { type: string; id: string }, client: pg.PoolClient): Promise<void> {
  if (amount <= 0) return;
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [`credits:${userId}`]);
  const existing = await client.query('select 1 from credit_transactions where idempotency_key = $1', [idempotencyKey]);
  if (existing.rowCount) return; // already charged
  const balance = await getBalance(userId, client);
  if (balance < amount) throw paymentRequired(`This job needs ${amount} credits but your balance is ${balance}.`, { required: amount, balance });
  await addTransaction(userId, -amount, reason, idempotencyKey, ref, client);
}

/** Refund a previous charge exactly once. Only refunds if the charge exists. */
export async function refundCharge(userId: string, chargeKey: string, refundKey: string, reason: string): Promise<boolean> {
  const chargeRow = await sqlOne<{ amount: number; reference_type: string; reference_id: string }>(
    'select amount, reference_type, reference_id from credit_transactions where idempotency_key = $1', [chargeKey]);
  if (!chargeRow || chargeRow.amount >= 0) return false;
  return addTransaction(userId, -chargeRow.amount, reason, refundKey, { type: chargeRow.reference_type, id: chargeRow.reference_id });
}
