import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Worker } from 'bullmq';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getApp, registerUser } from './helpers.js';
import { texturedImage } from './fixtures.js';
import { startMockProviders } from './mockProviders.js';
import { config } from '../src/config.js';
import { startWorkers } from '../src/worker.js';
import { queue, closeQueues } from '../src/jobs/queues.js';
import { run, workerScript } from '../src/utils/process.js';
import { sql } from '../src/database/pool.js';

let app: FastifyInstance; let workers: Worker[]; let mock: Awaited<ReturnType<typeof startMockProviders>>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function multipart(fields: Record<string, string>, files: { name: string; buf: Buffer }[]) {
  const boundary = '----v' + Math.random().toString(16).slice(2); const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) { parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: image/jpeg\r\n\r\n`), f.buf, Buffer.from('\r\n')); }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function projectWithImages(auth: Record<string, string>, angles: string[]) {
  const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Gen test', category: 'human' } })).json();
  const files = await Promise.all(angles.map(async (a, i) => ({ name: `${a}-${i}.jpg`, buf: await texturedImage(900, 900, 11 + i * 7) })));
  const mp = multipart({ project_id: p.id, angles: JSON.stringify(angles) }, files);
  const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...auth, ...mp.headers }, payload: mp.payload });
  expect(r.json().items).toHaveLength(angles.length);
  return p.id as string;
}

async function waitFor(auth: Record<string, string>, id: string, pred: (g: { status: string }) => boolean, ms = 120_000) {
  const t = Date.now();
  for (;;) {
    const g = (await app.inject({ url: `/api/generations/${id}`, headers: auth })).json();
    if (pred(g)) return g;
    if (Date.now() - t > ms) throw new Error(`timeout waiting; last status ${g.status} stage ${g.stage}`);
    await sleep(300);
  }
}
async function waitModelReady(auth: Record<string, string>, id: string) {
  const t = Date.now();
  for (;;) {
    const m = (await app.inject({ url: `/api/models/${id}`, headers: auth })).json();
    if (m.status !== 'processing') return m;
    if (Date.now() - t > 120_000) throw new Error('model not ready');
    await sleep(500);
  }
}

beforeAll(async () => {
  app = await getApp();
  await queue('ai').obliterate({ force: true }).catch(() => {});
  const glb = path.resolve(config.WORK_DIR, 'mock-model.glb');
  await fs.mkdir(config.WORK_DIR, { recursive: true });
  const r = await run(config.BLENDER_BIN, ['-b', '--factory-startup', '-P', workerScript('model-processing', 'demo_model.py'), '--', glb, 'human', '3000', '256'], { timeoutMs: 120_000 });
  expect(r.code).toBe(0);
  mock = await startMockProviders(glb);
  Object.assign(config, { MESHY_API_KEY: 'test-key', MESHY_API_BASE: mock.base, TRIPO_API_KEY: 'test-key', TRIPO_API_BASE: `${mock.base}/v2/openapi` });
  workers = startWorkers();
});
afterAll(async () => { await Promise.all(workers?.map((w) => w.close()) ?? []); await closeQueues(); await mock?.close(); });

describe('AI generation pipeline', () => {
  it('lists providers with capabilities and configuration status', async () => {
    const { auth } = await registerUser(app);
    const r = (await app.inject({ url: '/api/providers', headers: auth })).json();
    const ids = r.items.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['meshy', 'tripo', 'demo']));
    expect(r.items.find((p: { id: string }) => p.id === 'tripo').capabilities.multiview_angles).toEqual(['front', 'left', 'back', 'right']);
  });

  it('runs a Demo generation through BullMQ: model stored, measured and labelled as demo, 0 credits', async () => {
    const { auth } = await registerUser(app);
    const pid = await projectWithImages(auth, ['front']);
    const g = await app.inject({ method: 'POST', url: '/api/generations', headers: auth, payload: { project_id: pid, provider: 'demo', settings: { category: 'furniture', quality: 'standard', texture_resolution: '1k' } } });
    expect(g.statusCode).toBe(201);
    const done = await waitFor(auth, g.json().id, (x) => ['succeeded', 'failed'].includes(x.status));
    expect(done.status).toBe('succeeded');
    expect(done.is_demo).toBe(true);
    expect(done.used_image_ids).toHaveLength(0);
    expect(done.credits_charged).toBe(0);
    const m = await waitModelReady(auth, done.model_id);
    expect(m.status).toBe('ready');
    expect(m.is_demo).toBe(true);
    expect(m.stats.triangles).toBeGreaterThan(1000);
    expect(m.stats.textures[0].width).toBe(1024);
    expect(m.thumbnail_url).toBeTruthy();
  });

  it('Meshy: sends at most 4 images, polls real status, downloads GLB and charges credits once', async () => {
    const { auth } = await registerUser(app);
    const pid = await projectWithImages(auth, ['front', 'back', 'left', 'right', 'top', 'front_left']);
    const r = await app.inject({ method: 'POST', url: '/api/generations', headers: auth, payload: { project_id: pid, provider: 'meshy', settings: { category: 'human', quality: 'standard', pbr: true } } });
    expect(r.statusCode).toBe(201);
    const done = await waitFor(auth, r.json().id, (x) => ['succeeded', 'failed'].includes(x.status));
    expect(done.status).toBe('succeeded');
    expect(done.used_image_ids).toHaveLength(4);
    expect(done.input_image_ids).toHaveLength(6);
    expect(done.events.some((e: { message: string }) => e.message.includes('at most 4 images'))).toBe(true);
    const created = mock.state.calls.find((c) => c.url === '/openapi/v1/multi-image-to-3d' && c.method === 'POST')!.body as { image_urls: string[]; enable_pbr: boolean };
    expect(created.image_urls).toHaveLength(4);
    expect(created.image_urls[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(created.enable_pbr).toBe(true);
    const me = (await app.inject({ url: '/api/auth/me', headers: auth })).json();
    expect(me.credits).toBe(60 - 15);
    const m = await waitModelReady(auth, done.model_id);
    expect(m.provider).toBe('meshy');
    expect(m.is_demo).toBe(false);
  });

  it('Tripo: uses multiview Front/Left/Back/Right order; failure refunds credits exactly once', async () => {
    const { auth } = await registerUser(app);
    const pid = await projectWithImages(auth, ['right', 'front', 'back', 'left', 'top']);
    mock.state.behaviour.tripo = 'fail';
    const r = await app.inject({ method: 'POST', url: '/api/generations', headers: auth, payload: { project_id: pid, provider: 'tripo', settings: { category: 'human', quality: 'standard' } } });
    const gid = r.json().id;
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).json().credits).toBe(50);
    const done = await waitFor(auth, gid, (x) => ['succeeded', 'failed'].includes(x.status));
    expect(done.status).toBe('failed');
    expect(done.used_image_ids).toHaveLength(4);
    const task = mock.state.calls.filter((c) => c.url === '/v2/openapi/task' && c.method === 'POST').pop()!.body as { type: string; files: { file_token: string }[] };
    expect(task.type).toBe('multiview_to_model');
    expect(task.files).toHaveLength(4);
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).json().credits).toBe(60);
    // A second failure path for the same generation must not refund again.
    const { failGeneration } = await import('../src/services/generations.js');
    await failGeneration(gid, 'again');
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).json().credits).toBe(60);
    const refunds = await sql(`select count(*)::int as n from credit_transactions where idempotency_key = $1`, [`gen:${gid}:refund`]);
    expect(refunds[0]!.n).toBe(1);
    mock.state.behaviour.tripo = 'succeed';
  });

  it('cancels a running generation, cancels the provider task and refunds', async () => {
    const { auth } = await registerUser(app);
    const pid = await projectWithImages(auth, ['front']);
    mock.state.behaviour.meshy = 'hang';
    const r = await app.inject({ method: 'POST', url: '/api/generations', headers: auth, payload: { project_id: pid, provider: 'meshy', settings: { category: 'product', quality: 'draft' } } });
    const gid = r.json().id;
    const running = await waitFor(auth, gid, (x) => x.status === 'running' && (x as { progress: number | null }).progress === 45);
    expect(running.progress_source).toContain('Meshy');
    const c = await app.inject({ method: 'POST', url: `/api/generations/${gid}/cancel`, headers: auth });
    expect(c.json().status).toBe('cancelled');
    await sleep(1500);
    expect(mock.state.deleted.length).toBeGreaterThan(0);
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).json().credits).toBe(60);
    mock.state.behaviour.meshy = 'succeed';
  });

  it('enforces credits, plan limits, provider configuration and capabilities', async () => {
    const { auth, user } = await registerUser(app);
    const pid = await projectWithImages(auth, ['front']);
    const post = (provider: string, settings: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/generations', headers: auth, payload: { project_id: pid, provider, settings } });
    expect((await post('meshy', { quality: 'ultra' })).statusCode).toBe(403);                       // free plan
    expect((await post('tripo', { quality: 'standard', texture_prompt: 'marble' })).statusCode).toBe(400); // unsupported option
    expect((await post('meshy', { quality: 'standard', rig: true, category: 'furniture' })).statusCode).toBe(400);
    await sql(`insert into credit_transactions (user_id, amount, reason, idempotency_key) values ($1, -55, 'test drain', $2)`, [user.id, `drain:${user.id}`]);
    const poor = await post('meshy', { quality: 'standard' });
    expect(poor.statusCode).toBe(402);
    expect(await sql('select 1 from generations where project_id = $1 and provider = $2', [pid, 'meshy'])).toHaveLength(0); // atomic: no orphan row
    Object.assign(config, { TRIPO_API_KEY: '' });
    expect((await post('tripo', { quality: 'draft' })).statusCode).toBe(503);
    Object.assign(config, { TRIPO_API_KEY: 'test-key' });
  });
});
