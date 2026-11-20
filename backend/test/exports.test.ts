import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Worker } from 'bullmq';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getApp, registerUser } from './helpers.js';
import { startWorkers } from '../src/worker.js';
import { queue, closeQueues } from '../src/jobs/queues.js';
import { config } from '../src/config.js';
import { run } from '../src/utils/process.js';

let app: FastifyInstance; let workers: Worker[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function poll<T>(fn: () => Promise<T>, done: (x: T) => boolean, ms = 300_000) {
  const t = Date.now(); for (;;) { const x = await fn(); if (done(x)) return x; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(800); }
}
beforeAll(async () => { app = await getApp(); for (const q of ['ai', 'processing', 'export'] as const) await queue(q).obliterate({ force: true }).catch(() => {}); workers = startWorkers(); });
afterAll(async () => { await Promise.all(workers?.map((w) => w.close()) ?? []); await closeQueues(); });

describe('professional export', () => {
  it('exports every format with real converters, validates by re-import and packages a ZIP', async () => {
    const { auth } = await registerUser(app);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Chair', category: 'furniture' } })).json();
    const g = (await app.inject({ method: 'POST', url: '/api/generations', headers: auth, payload: { project_id: p.id, provider: 'demo', settings: { category: 'furniture', quality: 'draft', texture_resolution: '1k', polygon_level: 'low' } } })).json();
    const gen = await poll(async () => (await app.inject({ url: `/api/generations/${g.id}`, headers: auth })).json(), (x) => ['succeeded', 'failed'].includes(x.status));
    const model = await poll(async () => (await app.inject({ url: `/api/models/${gen.model_id}`, headers: auth })).json(), (m) => m.status === 'ready');

    const formats = ['fbx', 'glb', 'gltf', 'obj', 'usd', 'usdz', 'stl'];
    const r = await app.inject({ method: 'POST', url: `/api/models/${model.id}/export`, headers: auth, payload: { preset: 'universal', formats, settings: { units: 'cm' } } });
    expect(r.statusCode).toBe(202);
    const e = await poll(async () => (await app.inject({ url: `/api/exports/${r.json().id}`, headers: auth })).json(), (x) => ['succeeded', 'failed'].includes(x.status));
    expect(e.error).toBeNull();
    expect(e.status).toBe('succeeded');
    expect(new Set(e.files.map((f: { format: string }) => f.format))).toEqual(new Set(formats));
    for (const f of e.files) {
      expect(f.validated).toBe(true);
      expect(f.validation).toMatch(new RegExp(`${model.stats.triangles} triangles`));
    }
    // Download through the signed URL and inspect the archive.
    const { url } = (await app.inject({ url: `/api/exports/${e.id}/download`, headers: auth })).json();
    const zip = await app.inject({ url });
    expect(zip.statusCode).toBe(200);
    const zp = path.resolve(config.WORK_DIR, `test-${e.id}.zip`); await fs.writeFile(zp, zip.rawPayload);
    const list = await run(config.PYTHON_BIN, ['-c', 'import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps(z.namelist()));print(z.read([n for n in z.namelist() if n.endswith("metadata.json")][0]).decode())', zp]);
    const [namesLine, ...metaLines] = list.stdout.trim().split('\n');
    const names: string[] = JSON.parse(namesLine!);
    expect(names.some((n) => n.endsWith('README.md'))).toBe(true);
    for (const ext of ['.fbx', '.glb', '.gltf', '.obj', '.usdc', '.usdz', '.stl']) expect(names.some((n) => n.endsWith(ext))).toBe(true);
    const meta = JSON.parse(metaLines.join('\n'));
    expect(meta.is_demo).toBe(true);
    expect(meta.settings.units).toBe('cm');
    // Signatures are genuine (no renamed files).
    expect(zip.rawPayload.subarray(0, 2).toString()).toBe('PK');

    // Other users cannot download it.
    const other = await registerUser(app);
    expect((await app.inject({ url: `/api/exports/${e.id}/download`, headers: other.auth })).statusCode).toBe(404);
  }, 600_000);
});
