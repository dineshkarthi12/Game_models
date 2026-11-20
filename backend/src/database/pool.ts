import pg from 'pg';
import { config } from '../config.js';

// numeric → number, bigint (int8) → number (safe for byte counts below 2^53)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL, max: 10,
  ssl: config.DATABASE_SSL === 'disable' ? undefined : { rejectUnauthorized: config.DATABASE_SSL === 'require' },
});
export type Queryable = pg.Pool | pg.PoolClient;

/** System context (table owner, bypasses RLS). Use only in workers or for explicitly owner-scoped writes. */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(text, params);
  return r.rows;
}
export async function sqlOne<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await sql<T>(text, params))[0] ?? null;
}

export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * User context: runs inside a transaction as role `vistora_app` with app.current_user_id set,
 * so PostgreSQL Row Level Security policies are enforced for every statement.
 */
export async function asUser<T>(userId: string, fn: (q: UserDb) => Promise<T>): Promise<T> {
  return transaction(async (c) => {
    await c.query('set local role vistora_app');
    await c.query(`select set_config('app.current_user_id', $1, true)`, [userId]);
    const q: UserDb = {
      all: async (text, params = []) => (await c.query(text, params)).rows,
      one: async (text, params = []) => (await c.query(text, params)).rows[0] ?? null,
      client: c,
    };
    return fn(q);
  });
}
export interface UserDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all: <T = any>(text: string, params?: unknown[]) => Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  one: <T = any>(text: string, params?: unknown[]) => Promise<T | null>;
  client: pg.PoolClient;
}
