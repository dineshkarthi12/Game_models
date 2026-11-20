import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Worker } from 'bullmq';
import { getApp, registerUser } from './helpers.js';
import { startWorkers } from '../src/worker.js';
import { queue, closeQueues } from '../src/jobs/queues.js';

let app: FastifyInstance; let workers: Worker[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poll<T>(fn: () => Promise<T>, done: (x: T) => boolean, ms = 240_000) {
  const t = Date.now();
  for (;;) { const x = await fn(); if (done(x)) return x; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(700); }
}

beforeAll(async () => {
  app = await getApp();
  for (const q of ['ai', 'processing'] as const) await queue(q).obliterate({ force: true }).catch(() => {});
  workers = startWorkers();
});
afterAll(async () => { await Promise.all(workers?.map((w) => w.close()) ?? []); await closeQueues(); });

async function demoModel(auth: Record<string, string>) {
  const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Proc', category: 'furniture' } })).json();
  const g = (await app.inject({ method: 'POST', url: '/api/generations', headers: auth, payload: { project_id: p.id, provider: 'demo', settings: { category: 'furniture', quality: 'standard', texture_resolution: '1k', polygon_level: 'medium' } } })).json();
  const done = await poll(async () => (await app.inject({ url: `/api/generations/${g.id}`, headers: auth })).json(), (x) => ['succeeded', 'failed'].includes(x.status));
  expect(done.status).toBe('succeeded');
  return poll(async () => (await app.inject({ url: `/api/models/${done.model_id}`, headers: auth })).json(), (m) => m.status === 'ready');
}
const job = (auth: Record<string, string>, id: string) => poll(async () => (await app.inject({ url: `/api/processing-jobs/${id}`, headers: auth })).json(), (j) => ['succeeded', 'failed'].includes(j.status));

describe('validation, refinement and versions', () => {
  it('validates with measured checks and proportional dimension comparison for uncalibrated models', async () => {
    const { auth } = await registerUser(app);
    const m = await demoModel(auth);
    const meta = (await app.inject({ url: `/api/models/${m.id}/metadata`, headers: auth })).json();
    expect(meta.stats.integrity).toBeTruthy();
    const [w, h] = meta.stats.dimensions;
    // Two measurements in exact model proportions -> ~0% proportional deviation.
    const r = await app.inject({ method: 'POST', url: `/api/models/${m.id}/validate`, headers: auth, payload: { measurements: { width: w * 100, height: h * 100, unit: 'cm' } } });
    expect(r.statusCode).toBe(202);
    const j = await job(auth, r.json().id);
    expect(j.status).toBe('succeeded');
    const rep = (await app.inject({ url: `/api/models/${m.id}/quality-report`, headers: auth })).json().report;
    const ids = rep.checks.map((c: { id: string }) => c.id);
    for (const k of ['non_manifold', 'missing_faces', 'continuity', 'normals', 'uv', 'texture_quality', 'scale', 'dimensions']) expect(ids).toContain(k);
    const dim = rep.checks.find((c: { id: string }) => c.id === 'dimensions');
    expect(dim.detail).toMatch(/Proportional/);
    expect(rep.metrics.geometric_deviation).toBeLessThan(0.001);
    expect(rep.limitations[0]).toMatch(/DEMO/);
    expect(JSON.stringify(rep)).not.toMatch(/accuracy"\s*:\s*\d/); // no invented accuracy score
  }, 400_000);

  it('refines into a new version, keeps history, and restores', async () => {
    const { auth } = await registerUser(app);
    const m = await demoModel(auth);
    const before = m.stats.triangles;
    const bad = await app.inject({ method: 'POST', url: `/api/models/${m.id}/refine`, headers: auth, payload: { operations: [{ op: 'explode' }] } });
    expect(bad.statusCode).toBe(400);
    const r = await app.inject({ method: 'POST', url: `/api/models/${m.id}/refine`, headers: auth, payload: { operations: [{ op: 'cleanup' }, { op: 'decimate', target_triangles: Math.floor(before / 3) }, { op: 'normals' }, { op: 'texture_enhance', amount: 0.5 }] } });
    expect(r.statusCode).toBe(202);
    const j = await job(auth, r.json().id);
    expect(j.status).toBe('succeeded');
    const versions = (await app.inject({ url: `/api/models/${m.id}/versions`, headers: auth })).json().items;
    expect(versions).toHaveLength(2);
    const v2 = versions[0];
    expect(v2.parent_version_id).toBe(versions[1].id);
    expect(v2.stats.triangles).toBeLessThan(before * 0.5);
    expect(v2.params.results.map((x: { op: string }) => x.op)).toEqual(['cleanup', 'decimate', 'normals', 'uv_unwrap', 'texture_enhance']);
    expect(v2.params.texture_transferred).toBe(true);
    expect((await app.inject({ url: `/api/models/${m.id}`, headers: auth })).json().current_version_id).toBe(v2.id);
    // current version cannot be deleted; restore previous then delete v2
    expect((await app.inject({ method: 'DELETE', url: `/api/models/${m.id}/versions/${v2.id}`, headers: auth })).statusCode).toBe(400);
    await app.inject({ method: 'PUT', url: `/api/models/${m.id}/current-version`, headers: auth, payload: { version_id: versions[1].id } });
    expect((await app.inject({ method: 'DELETE', url: `/api/models/${m.id}/versions/${v2.id}`, headers: auth })).statusCode).toBe(200);
    // another user cannot refine this model
    const other = await registerUser(app);
    expect((await app.inject({ method: 'POST', url: `/api/models/${m.id}/refine`, headers: other.auth, payload: { operations: [{ op: 'normals' }] } })).statusCode).toBe(404);
  }, 400_000);

  it('creates a game-ready LOD chain with normal map and collision mesh', async () => {
    const { auth } = await registerUser(app);
    const m = await demoModel(auth);
    const bad = await app.inject({ method: 'POST', url: `/api/models/${m.id}/optimize`, headers: auth, payload: { budget: 2000, texture: 1000, lods: [1, 0.5] } });
    expect(bad.statusCode).toBe(400); // texture must be power of two
    const r = await app.inject({ method: 'POST', url: `/api/models/${m.id}/optimize`, headers: auth, payload: { preset: 'mobile', budget: 2000, texture: 512, lods: [1, 0.5], collision: 'box', normal_map: true } });
    expect(r.statusCode).toBe(202);
    const j = await job(auth, r.json().id);
    expect(j.status).toBe('succeeded');
    const versions = (await app.inject({ url: `/api/models/${m.id}/versions`, headers: auth })).json().items;
    const lods = versions.filter((v: { is_lod: boolean }) => v.is_lod).sort((a: { lod_level: number }, b: { lod_level: number }) => a.lod_level - b.lod_level);
    expect(lods.map((v: { lod_level: number }) => v.lod_level)).toEqual([0, 1]);
    expect(lods[0].stats.triangles).toBeLessThanOrEqual(2000);
    expect(lods[1].stats.triangles).toBeLessThan(lods[0].stats.triangles);
    expect(lods[0].stats.textures.map((t: { role: string }) => t.role)).toContain('normal');
    const rep = lods[0].params.game_ready_report;
    expect(rep.checks.find((c: { id: string }) => c.id === 'budget').status).toBe('pass');
    expect(lods[0].params.collision.type).toBe('box');
    const model = (await app.inject({ url: `/api/models/${m.id}`, headers: auth })).json();
    expect(model.current_version_id).toBe(lods[0].id);
    expect(model.game_ready).toBe(rep.game_ready);
  }, 400_000);
});
