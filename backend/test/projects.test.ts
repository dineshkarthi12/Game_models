import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getApp, registerUser } from './helpers.js';
import { asUser } from '../src/database/pool.js';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); });

describe('projects', () => {
  it('creates, lists with search/filter/sort/pagination, updates and deletes', async () => {
    const { auth } = await registerUser(app);
    for (const [name, category] of [['Lion Statue', 'custom'], ['Vintage Bike', 'vehicle'], ['Wooden Chair', 'furniture'], ['Game Character', 'human']]) {
      const r = await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name, category } });
      expect(r.statusCode).toBe(201);
    }
    const all = (await app.inject({ url: '/api/projects?sort=name&order=asc', headers: auth })).json();
    expect(all.total).toBe(4);
    expect(all.items.map((p: { name: string }) => p.name)).toEqual(['Game Character', 'Lion Statue', 'Vintage Bike', 'Wooden Chair']);
    expect((await app.inject({ url: '/api/projects?q=bike', headers: auth })).json().total).toBe(1);
    expect((await app.inject({ url: '/api/projects?category=furniture', headers: auth })).json().items[0].name).toBe('Wooden Chair');
    const page2 = (await app.inject({ url: '/api/projects?page=2&page_size=3&sort=name&order=asc', headers: auth })).json();
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(4);

    const id = all.items[0].id;
    const upd = await app.inject({ method: 'PUT', url: `/api/projects/${id}`, headers: auth, payload: { name: 'Hero Character', description: 'A knight' } });
    expect(upd.json().name).toBe('Hero Character');
    expect((await app.inject({ method: 'DELETE', url: `/api/projects/${id}`, headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/projects/${id}`, headers: auth })).statusCode).toBe(404);
  });

  it('validates input', async () => {
    const { auth } = await registerUser(app);
    expect((await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'x', category: 'spaceship' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/projects/not-a-uuid', headers: auth })).statusCode).toBe(400);
  });

  it('isolates users via API and at the database level (RLS)', async () => {
    const a = await registerUser(app, 'Alice');
    const b = await registerUser(app, 'Bob');
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: a.auth, payload: { name: 'Private' } })).json();
    expect((await app.inject({ url: `/api/projects/${p.id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/api/projects/${p.id}`, headers: b.auth, payload: { name: 'pwned' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/projects/${p.id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/projects', headers: b.auth })).json().total).toBe(0);
    // Unfiltered query as Bob returns none of Alice's rows: enforced by PostgreSQL, not by WHERE clauses.
    const rows = await asUser(b.user.id, (db) => db.all('select id from projects'));
    expect(rows.find((r) => r.id === p.id)).toBeUndefined();
    const credits = await asUser(b.user.id, (db) => db.all('select user_id from credit_transactions'));
    expect(credits.every((c) => c.user_id === b.user.id)).toBe(true);
    // App role cannot write to the credit ledger directly.
    await expect(asUser(b.user.id, (db) => db.all(`insert into credit_transactions (user_id, amount, reason, idempotency_key) values ($1, 1000, 'hack', 'x')`, [b.user.id]))).rejects.toThrow();
  });

  it('returns dashboard summary and manages folders', async () => {
    const { auth } = await registerUser(app);
    await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'One' } });
    const d = (await app.inject({ url: '/api/dashboard', headers: auth })).json();
    expect(d.totals.projects).toBe(1);
    expect(d.totals.credits).toBe(60);
    expect(d.recent_projects[0].name).toBe('One');
    const f = await app.inject({ method: 'POST', url: '/api/folders', headers: auth, payload: { name: 'Props' } });
    expect(f.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/folders', headers: auth, payload: { name: 'props' } })).statusCode).toBe(409);
    expect((await app.inject({ url: '/api/folders', headers: auth })).json().items).toHaveLength(1);
    expect((await app.inject({ url: '/api/models', headers: auth })).json().total).toBe(0);
    expect((await app.inject({ url: '/api/generations', headers: auth })).json().total).toBe(0);
  });
});
