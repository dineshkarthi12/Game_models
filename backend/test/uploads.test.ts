import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { getApp, registerUser, fetchSigned } from './helpers.js';
import { texturedImage } from './fixtures.js';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); });

function multipart(fields: Record<string, string>, files: { name: string; buf: Buffer; type?: string }[]) {
  const boundary = '----vistora' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type ?? 'image/jpeg'}\r\n\r\n`));
    parts.push(f.buf, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('uploads & dataset analysis', () => {
  it('uploads, validates, detects duplicates/blur/low-res and analyses coverage and overlap', async () => {
    const { auth } = await registerUser(app);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Scan' } })).json();
    const a = await texturedImage(1600, 1200, 1, { shiftX: 0 });
    const b = await texturedImage(1600, 1200, 1, { shiftX: 200 });   // overlaps a
    const c = await texturedImage(1600, 1200, 1, { shiftX: 400 });   // overlaps b
    const blurry = await texturedImage(1600, 1200, 5, { blur: 12 });
    const small = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#888' } }).png().toBuffer();
    const fake = Buffer.from('this is not an image at all');

    const mp = multipart({ project_id: p.id, angles: JSON.stringify(['front', 'front_right', 'right', 'back', 'top', 'left', 'left']) }, [
      { name: 'a.jpg', buf: a }, { name: 'b.jpg', buf: b }, { name: 'c.jpg', buf: c }, { name: 'blur.jpg', buf: blurry },
      { name: 'small.png', buf: small, type: 'image/png' }, { name: 'fake.jpg', buf: fake }, { name: 'a-copy.jpg', buf: a },
    ]);
    const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...auth, ...mp.headers }, payload: mp.payload });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.items).toHaveLength(5);
    expect(body.rejected.map((x: { name: string }) => x.name).sort()).toEqual(['a-copy.jpg', 'fake.jpg']);
    const byName = Object.fromEntries(body.items.map((i: { original_name: string }) => [i.original_name, i]));
    expect(byName['a.jpg'].angle).toBe('front');
    expect(byName['blur.jpg'].quality.is_blurry).toBe(true);
    expect(byName['a.jpg'].quality.is_blurry).toBe(false);
    expect(byName['small.png'].quality.resolution_ok).toBe(false);
    expect(byName['a.jpg'].width).toBe(1600);

    // Signed file URL serves the original bytes; tampered token is rejected.
    const f = await fetchSigned(app, byName['a.jpg'].url);
    expect(f.status).toBe(200);
    expect(f.body.equals(a)).toBe(true);
    // Local driver: the API enforces the HMAC signature. (S3 presigned URLs are enforced by the provider;
    // the moto test double used for S3 runs does not check signatures.)
    if (!/^https?:/.test(byName['a.jpg'].url)) expect((await fetchSigned(app, byName['a.jpg'].url.slice(0, -3) + 'xyz')).status).toBe(403);

    const an = (await app.inject({ url: `/api/projects/${p.id}/analysis`, headers: auth })).json();
    expect(an.image_count).toBe(5);
    expect(an.coverage.find((c: { angle: string }) => c.angle === 'front').present).toBe(true);
    expect(an.missing_angles).toContain('bottom');
    expect(an.coverage_ratio).toBeCloseTo(0.5, 5);
    expect(an.blurry_image_ids).toContain(byName['blur.jpg'].id);
    expect(an.blurry_image_ids).not.toContain(byName['a.jpg'].id);
    expect(an.recommendations.length).toBeGreaterThan(0);

    const ov = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/analysis/overlap`, headers: auth });
    expect(ov.statusCode).toBe(200);
    const o = ov.json();
    const pair = o.pairs.find((x: { a: string; b: string }) => [x.a, x.b].sort().join() === [byName['a.jpg'].id, byName['b.jpg'].id].sort().join());
    expect(pair.inliers).toBeGreaterThan(40);
    expect(o.weakly_connected_image_ids).toContain(byName['small.png'].id);

    // angle update, reorder, replace, delete
    const upd = await app.inject({ method: 'PATCH', url: `/api/uploads/${byName['c.jpg'].id}`, headers: auth, payload: { angle: 'back_right' } });
    expect(upd.json().angle).toBe('back_right');
    const ids = body.items.map((i: { id: string }) => i.id).reverse();
    await app.inject({ method: 'PUT', url: `/api/projects/${p.id}/images/order`, headers: auth, payload: { ids } });
    const list = (await app.inject({ url: `/api/projects/${p.id}/images`, headers: auth })).json();
    expect(list.items.map((i: { id: string }) => i.id)).toEqual(ids);
    const rep = multipart({}, [{ name: 'sharp.jpg', buf: await texturedImage(1600, 1200, 3) }]);
    const rr = await app.inject({ method: 'POST', url: `/api/uploads/${byName['blur.jpg'].id}/replace`, headers: { ...auth, ...rep.headers }, payload: rep.payload });
    expect(rr.statusCode).toBe(200);
    expect(rr.json().quality.is_blurry).toBe(false);
    expect(rr.json().angle).toBe('back');
    expect((await app.inject({ method: 'DELETE', url: `/api/uploads/${byName['small.png'].id}`, headers: auth })).statusCode).toBe(200);
    const me = (await app.inject({ url: '/api/auth/me', headers: auth })).json();
    expect(me.storage_used_bytes).toBeGreaterThan(0);
  });

  it('prevents other users from uploading into or reading a project', async () => {
    const a = await registerUser(app); const b = await registerUser(app);
    const p = (await app.inject({ method: 'POST', url: '/api/projects', headers: a.auth, payload: { name: 'Mine' } })).json();
    const mp = multipart({ project_id: p.id }, [{ name: 'x.jpg', buf: await texturedImage(800, 800, 3) }]);
    expect((await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...b.auth, ...mp.headers }, payload: mp.payload })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/projects/${p.id}/images`, headers: b.auth })).json().items).toHaveLength(0);
  });
});
