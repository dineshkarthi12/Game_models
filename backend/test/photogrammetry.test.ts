import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Worker } from 'bullmq';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getApp, registerUser } from './helpers.js';
import { texturedImage } from './fixtures.js';
import { config } from '../src/config.js';
import { startWorkers } from '../src/worker.js';
import { queue, closeQueues } from '../src/jobs/queues.js';
import { run, workerScript } from '../src/utils/process.js';
import { sql } from '../src/database/pool.js';

let app: FastifyInstance; let workers: Worker[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DATASET = path.resolve('.tmp/test-fixtures/ring-dataset');

/** Synthetic dataset with known ground truth, rendered once and cached. */
async function dataset() {
  if (await fs.stat(path.join(DATASET, 'ground_truth.json')).catch(() => null)) return DATASET;
  const r = await run(config.BLENDER_BIN, ['-b', '--factory-startup', '-P', workerScript('tools', 'render_dataset.py'), '--', DATASET,
    '--ring1', '18', '--ring2', '12', '--size', '800', '--samples', '10'], { timeoutMs: 900_000 });
  if (r.code !== 0) throw new Error(r.stderr.slice(-500));
  return DATASET;
}

function multipart(fields: Record<string, string>, files: { name: string; buf: Buffer }[]) {
  const boundary = '----v' + Math.random().toString(16).slice(2); const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: image/jpeg\r\n\r\n`), f.buf, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function upload(auth: Record<string, string>, pid: string, files: { name: string; buf: Buffer; angle: string }[]) {
  for (let i = 0; i < files.length; i += 10) {
    const b = files.slice(i, i + 10);
    const mp = multipart({ project_id: pid, angles: JSON.stringify(b.map((f) => f.angle)) }, b);
    const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...auth, ...mp.headers }, payload: mp.payload });
    expect(r.statusCode).toBe(201);
  }
}

async function waitFor(auth: Record<string, string>, id: string, pred: (g: { status: string; stage: string }) => boolean, ms = 900_000) {
  const t = Date.now();
  for (;;) {
    const g = (await app.inject({ url: `/api/reconstruction/${id}`, headers: auth })).json();
    if (pred(g)) return g;
    if (Date.now() - t > ms) throw new Error(`timeout: ${g.status}/${g.stage}`);
    await sleep(1000);
  }
}

beforeAll(async () => {
  app = await getApp();
  await queue('photogrammetry').obliterate({ force: true }).catch(() => {});
  await queue('processing').obliterate({ force: true }).catch(() => {});
  workers = startWorkers();
}, 900_000);
afterAll(async () => { await Promise.all(workers?.map((w) => w.close()) ?? []); await closeQueues(); });

describe('photogrammetry pipeline (COLMAP)', () => {
  it('reconstructs a textured, scale-calibrated model from overlapping photos', async () => {
    const dir = await dataset();
    const gt = JSON.parse(await fs.readFile(path.join(dir, 'ground_truth.json'), 'utf8'));
    const { auth, user } = await registerUser(app);
    await sql(`update profiles set plan = 'pro' where user_id = $1`, [user.id]);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Sculpture scan', category: 'product' } })).json();
    await upload(auth, p.id, await Promise.all(gt.shots.map(async (s: { file: string; angle: string }) => ({ name: s.file, angle: s.angle, buf: await fs.readFile(path.join(dir, s.file)) }))));
    const [w, , h] = gt.object_dimensions as number[];  // Blender: x width, y depth, z height
    const r = await app.inject({ method: 'POST', url: '/api/reconstruction', headers: auth,
      payload: { project_id: p.id, settings: { category: 'product', quality: 'draft', known_dimension: { axis: 'x', value: +(w * 100).toFixed(2), unit: 'cm' } } } });
    expect(r.statusCode).toBe(201);
    expect(r.json().credits_charged).toBe(8);
    const g = await waitFor(auth, r.json().id, (x) => ['succeeded', 'failed'].includes(x.status));
    if (g.status !== 'succeeded') throw new Error(`reconstruction failed: ${g.error}`);
    const rec = g.reconstruction;
    expect(rec.registered_images).toBeGreaterThanOrEqual(Math.floor(gt.shots.length * 0.9));
    expect(rec.mean_reprojection_error).toBeLessThan(1.5);
    expect(rec.dense_mode).toBe('cpu_sgbm_fusion');
    expect(rec.point_cloud_url).toBeTruthy();
    const stages = g.events.map((e: { stage: string }) => e.stage);
    for (const s of ['feature_extraction', 'feature_matching', 'sparse_reconstruction', 'dense_reconstruction', 'meshing', 'texturing', 'scale_calibration']) expect(stages).toContain(s);

    let m;
    for (let i = 0; i < 240; i++) { m = (await app.inject({ url: `/api/models/${g.model_id}`, headers: auth })).json(); if (m.status !== 'processing') break; await sleep(1000); }
    expect(m.status).toBe('ready');
    expect(m.source).toBe('photogrammetry');
    expect(m.stats.scale_calibrated).toBe(true);
    expect(m.stats.has_uvs).toBe(true);
    expect(m.stats.textures[0].width).toBe(1024);
    // Independent check: width was given, height is measured. Compare to the synthetic ground truth.
    const [mx, my] = m.stats.dimensions as number[];
    expect(Math.abs(mx - w) / w).toBeLessThan(0.01);
    const heightDeviation = Math.abs(my - h) / h;
    console.log(`height ${my.toFixed(4)} m vs ground truth ${h.toFixed(4)} m → deviation ${(heightDeviation * 100).toFixed(2)}%`);
    expect(heightDeviation).toBeLessThan(0.08);
  }, 1_200_000);

  it('fails cleanly with a clear message and a refund when photos do not overlap', async () => {
    const { auth } = await registerUser(app);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Unrelated' } })).json();
    await upload(auth, p.id, await Promise.all([3, 17, 29, 41].map(async (s, i) => ({ name: `u${i}.jpg`, angle: 'custom', buf: await texturedImage(800, 800, s) }))));
    const r = await app.inject({ method: 'POST', url: '/api/reconstruction', headers: auth, payload: { project_id: p.id, settings: { quality: 'draft' } } });
    const g = await waitFor(auth, r.json().id, (x) => ['succeeded', 'failed'].includes(x.status), 300_000);
    expect(g.status).toBe('failed');
    expect(g.error).toMatch(/register|overlap/i);
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).json().credits).toBe(60);
    expect(g.reconstruction.log_url).toBeTruthy();
  }, 400_000);

  it('cancels a running reconstruction and terminates the COLMAP process tree', async () => {
    const dir = await dataset();
    const gt = JSON.parse(await fs.readFile(path.join(dir, 'ground_truth.json'), 'utf8'));
    const { auth } = await registerUser(app);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Cancel me' } })).json();
    await upload(auth, p.id, await Promise.all(gt.shots.slice(0, 12).map(async (s: { file: string; angle: string }) => ({ name: s.file, angle: s.angle, buf: await fs.readFile(path.join(dir, s.file)) }))));
    const r = await app.inject({ method: 'POST', url: '/api/reconstruction', headers: auth, payload: { project_id: p.id, settings: { quality: 'standard' } } });
    await waitFor(auth, r.json().id, (x) => x.status === 'running' && !!x.stage && x.stage !== 'validating', 120_000);
    const c = await app.inject({ method: 'POST', url: `/api/reconstruction/${r.json().id}/cancel`, headers: auth });
    expect(c.json().status).toBe('cancelled');
    await sleep(9000);
    const ps = await run('pgrep', ['-f', 'pipeline.py']);
    expect(ps.stdout.trim()).toBe('');
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).json().credits).toBe(60);
  }, 300_000);
});
