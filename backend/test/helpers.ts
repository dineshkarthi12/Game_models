import type { FastifyInstance } from 'fastify';
import { pool } from '../src/database/pool.js';
import { migrate } from '../src/database/migrate.js';
import { buildApp } from '../src/app.js';

export async function resetDb() {
  await pool.query('drop schema if exists public cascade; create schema public; grant all on schema public to public;');
  await migrate(() => {});
}

let app: FastifyInstance | null = null;
export async function getApp() {
  if (!app) { await resetDb(); app = await buildApp(); await app.ready(); }
  return app;
}

let n = 0;
export async function registerUser(a: FastifyInstance, name = 'Tester') {
  const email = `user${Date.now()}_${n++}@example.com`;
  const res = await a.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'Passw0rd!x', full_name: name } });
  if (res.statusCode !== 201) throw new Error(`register failed ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { token: body.token as string, user: body.user, email, auth: { authorization: `Bearer ${body.token}` } };
}
