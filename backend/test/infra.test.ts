import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getApp, registerUser } from './helpers.js';
import { sql } from '../src/database/pool.js';
import { grantMonthlyCredits, reapStuckJobs } from '../src/services/maintenance.js';
import { closeQueues, queue } from '../src/jobs/queues.js';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); await queue('ai').obliterate({ force: true }).catch(() => {}); });
afterAll(async () => { await closeQueues(); });

describe('production infrastructure', () => {
  it('teams: Studio plan required, invites link on sign-in, shared projects follow RLS', async () => {
    const owner = await registerUser(app, 'Owner'); const member = await registerUser(app, 'Member'); const outsider = await registerUser(app, 'Out');
    expect((await app.inject({ method: 'POST', url: '/api/teams', headers: owner.auth, payload: { name: 'Studio A' } })).statusCode).toBe(403);
    await sql(`update profiles set plan = 'studio' where user_id = $1`, [owner.user.id]);
    const team = (await app.inject({ method: 'POST', url: '/api/teams', headers: owner.auth, payload: { name: 'Studio A' } })).json();
    expect((await app.inject({ method: 'POST', url: `/api/teams/${team.id}/invites`, headers: owner.auth, payload: { email: member.email } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/api/teams/${team.id}/invites`, headers: member.auth, payload: { email: outsider.email } })).statusCode).toBe(404);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: owner.auth, payload: { name: 'Shared scan' } })).json();
    expect((await app.inject({ method: 'PUT', url: `/api/projects/${p.id}/team`, headers: owner.auth, payload: { team_id: team.id } })).statusCode).toBe(200);
    // Before accepting, the member cannot see it.
    expect((await app.inject({ url: `/api/projects/${p.id}`, headers: member.auth })).statusCode).toBe(404);
    const mt = (await app.inject({ url: '/api/teams', headers: member.auth })).json();   // accepts the pending invite
    expect(mt.items[0].role).toBe('member');
    expect((await app.inject({ url: `/api/projects/${p.id}`, headers: member.auth })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/projects/${p.id}`, headers: outsider.auth })).statusCode).toBe(404);
    // Members can read but not delete the owner's project.
    expect((await app.inject({ method: 'DELETE', url: `/api/projects/${p.id}`, headers: member.auth })).statusCode).toBe(404);
  });

  it('credit ledger has a running balance; monthly credits are granted once per month; checkout is not configured', async () => {
    const { auth, user } = await registerUser(app);
    await sql(`update profiles set plan = 'pro', created_at = now() - interval '40 days' where user_id = $1`, [user.id]);
    const a = await grantMonthlyCredits(new Date('2026-12-02T00:00:00Z'));
    const b = await grantMonthlyCredits(new Date('2026-12-20T00:00:00Z'));
    expect(a.granted).toBeGreaterThanOrEqual(1);
    const mine = await sql(`select count(*)::int as n from credit_transactions where user_id = $1 and idempotency_key like 'monthly:%'`, [user.id]);
    expect(mine[0]!.n).toBe(1); void b;
    const tx = (await app.inject({ url: '/api/billing/transactions', headers: auth })).json();
    expect(tx.items[0].balance_after).toBe(660);
    expect(tx.items[1].balance_after).toBe(60);
    expect((await app.inject({ method: 'POST', url: '/api/billing/checkout', headers: auth, payload: { plan: 'pro' } })).json().error).toBe('payments_not_configured');
  });

  it('reaper fails interrupted generations and refunds exactly once', async () => {
    const { auth, user } = await registerUser(app);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Crash' } })).json();
    const [g] = await sql<{ id: string }>(`insert into generations (owner_id, project_id, mode, provider, status, created_at, credits_charged) values ($1,$2,'photogrammetry','colmap','running', now() - interval '1 hour', 12) returning id`, [user.id, p.id]);
    await sql(`insert into credit_transactions (user_id, amount, reason, reference_type, reference_id, idempotency_key) values ($1,-12,'test','generation',$2,$3)`, [user.id, g!.id, `gen:${g!.id}:charge`]);
    const r = await reapStuckJobs();
    expect(r.generations).toBeGreaterThanOrEqual(1);
    await reapStuckJobs();
    const gen = (await app.inject({ url: `/api/generations/${g!.id}`, headers: auth })).json();
    expect(gen.status).toBe('failed');
    expect(gen.error).toMatch(/interrupted/i);
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).json().credits).toBe(60);
  });

  it('readiness reports dependencies and responses carry request ids', async () => {
    const r = await app.inject({ url: '/api/health/ready' });
    expect(r.statusCode).toBe(200);
    expect(r.json().checks).toEqual({ database: 'ok', redis: 'ok', storage: 'ok' });
    expect(r.headers['x-request-id']).toBeTruthy();
    const nf = await app.inject({ url: '/api/nope' });
    expect(nf.statusCode).toBe(404);
  });
});
