import http from 'node:http';
import fs from 'node:fs';

/**
 * Local stand-in for the Meshy and Tripo HTTP contracts (as implemented by the adapters).
 * Used only by tests — never by the application.
 */
export function startMockProviders(glbPath: string) {
  const state = {
    calls: [] as { method: string; url: string; body: unknown }[],
    meshyPolls: new Map<string, number>(),
    tripoPolls: new Map<string, number>(),
    behaviour: { meshy: 'succeed' as 'succeed' | 'fail' | 'hang', tripo: 'succeed' as 'succeed' | 'fail' | 'hang' },
    deleted: [] as string[],
  };
  let n = 0;
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    let body: unknown = null; try { body = JSON.parse(raw.toString()); } catch { body = `[${raw.length} bytes]`; }
    const url = req.url ?? ''; state.calls.push({ method: req.method ?? '', url, body });
    const json = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    // Result files are pre-signed public URLs (no auth header), like the real providers.
    if (url === '/files/model.glb') { res.writeHead(200, { 'content-type': 'model/gltf-binary' }); return fs.createReadStream(glbPath).pipe(res); }
    if (req.headers.authorization !== 'Bearer test-key') return json(401, { message: 'Invalid API key' });
    // ── Meshy ──
    let m = url.match(/^\/openapi\/v1\/(image-to-3d|multi-image-to-3d|rigging)$/);
    if (m && req.method === 'POST') return json(202, { result: `meshy-${++n}` });
    m = url.match(/^\/openapi\/v1\/(image-to-3d|multi-image-to-3d|rigging)\/(.+)$/);
    if (m && req.method === 'DELETE') { state.deleted.push(m[2]!); return json(200, {}); }
    if (m) {
      const k = (state.meshyPolls.get(m[2]!) ?? 0) + 1; state.meshyPolls.set(m[2]!, k);
      if (state.behaviour.meshy === 'hang' || k < 3) return json(200, { id: m[2], status: k === 1 ? 'PENDING' : 'IN_PROGRESS', progress: k === 1 ? 0 : 45 });
      if (state.behaviour.meshy === 'fail') return json(200, { id: m[2], status: 'FAILED', progress: 60, task_error: { message: 'Mock: image could not be processed' } });
      return json(200, { id: m[2], status: 'SUCCEEDED', progress: 100, model_urls: { glb: `${base}/files/model.glb` }, thumbnail_url: `${base}/t.png` });
    }
    // ── Tripo ──
    if (url === '/v2/openapi/upload' && req.method === 'POST') return json(200, { code: 0, data: { image_token: `tok-${++n}` } });
    if (url === '/v2/openapi/task' && req.method === 'POST') return json(200, { code: 0, data: { task_id: `tripo-${++n}` } });
    m = url.match(/^\/v2\/openapi\/task\/(.+)$/);
    if (m) {
      const k = (state.tripoPolls.get(m[1]!) ?? 0) + 1; state.tripoPolls.set(m[1]!, k);
      if (state.behaviour.tripo === 'hang' || k < 2) return json(200, { code: 0, data: { task_id: m[1], status: 'running', progress: 30 } });
      if (state.behaviour.tripo === 'fail') return json(200, { code: 0, data: { task_id: m[1], status: 'failed', progress: 30 } });
      return json(200, { code: 0, data: { task_id: m[1], status: 'success', progress: 100, output: { pbr_model: `${base}/files/model.glb` } } });
    }
    json(404, { message: 'not found' });
  });
  return new Promise<{ base: string; state: typeof state; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve({ base, state, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
