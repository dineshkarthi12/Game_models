import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../database/migrations');

export async function migrate(log = console.log) {
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await pool.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const text = await fs.readFile(path.join(dir, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(text);
      await c.query('insert into schema_migrations (name) values ($1)', [f]);
      await c.query('commit');
      log(`applied ${f}`);
    } catch (e) {
      await c.query('rollback');
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    } finally { c.release(); }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
