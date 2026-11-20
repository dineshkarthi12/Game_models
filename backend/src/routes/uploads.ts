import type { FastifyInstance, FastifyRequest } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { asUser, sqlOne, sql } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';
import { AppError, badRequest, notFound } from '../utils/errors.js';
import { storage, keys } from '../storage/index.js';
import { analyzeImage, makeThumb, sniffImage } from '../services/imageAnalysis.js';
import { analyzeDataset } from '../services/datasetAnalysis.js';
import { serializeImage } from '../services/serializers.js';
import { assertQuota, recalcStorage } from '../services/storageUsage.js';
import { makeWorkDir, materialize, run, workerScript } from '../utils/process.js';

const ANGLES = ['front', 'back', 'left', 'right', 'front_left', 'front_right', 'back_left', 'back_right', 'top', 'bottom', 'custom'] as const;
const IMAGE_SELECT = 'select * from project_images';

async function readFile(part: { toBuffer: () => Promise<Buffer> }) {
  try { return await part.toBuffer(); } catch (e) {
    if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError(413, 'file_too_large', `Files must be smaller than ${config.MAX_UPLOAD_MB} MB`);
    throw e;
  }
}

async function storeImage(userId: string, projectId: string, id: string, buf: Buffer) {
  const kind = sniffImage(buf);
  if (!kind) throw badRequest('Unsupported file type. Use JPG, PNG or WEBP images.');
  let a: Awaited<ReturnType<typeof analyzeImage>>;
  try { a = await analyzeImage(buf); } catch { throw badRequest('The image could not be decoded (corrupt or unsupported).'); }
  if (a.width < 256 || a.height < 256) throw badRequest(`Image is too small (${a.width}×${a.height}). Minimum is 256px.`);
  if (a.width * a.height > 120e6) throw badRequest('Image exceeds 120 megapixels.');
  const key = keys.image(userId, projectId, id, kind.ext);
  const thumbKey = keys.thumb(userId, projectId, id);
  await storage.put(key, buf, kind.mime);
  await storage.put(thumbKey, await makeThumb(buf), 'image/webp');
  return { kind, a, key, thumbKey };
}

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/uploads', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply) => {
    if (!req.isMultipart()) throw badRequest('Expected multipart/form-data');
    const fields: Record<string, string> = {};
    const files: { name: string; buf: Buffer }[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') files.push({ name: part.filename.slice(0, 200), buf: await readFile(part) });
      else fields[part.fieldname] = String(part.value);
    }
    const meta = parse(z.object({ project_id: uuid, angle: z.enum(ANGLES).optional(), angles: z.string().optional() }), fields);
    const angleList: string[] = meta.angles ? (JSON.parse(meta.angles) as string[]) : [];
    if (!files.length) throw badRequest('No files received');

    const project = await asUser(req.user.id, (db) => db.one('select id, owner_id from projects where id = $1', [meta.project_id]));
    if (!project) throw notFound('Project');
    const count = await sqlOne<{ n: number }>('select count(*)::int as n from project_images where project_id = $1', [meta.project_id]);
    if ((count?.n ?? 0) + files.length > config.MAX_IMAGES_PER_PROJECT) throw badRequest(`A project can hold at most ${config.MAX_IMAGES_PER_PROJECT} images`);
    await assertQuota(req.user.id, files.reduce((s, f) => s + f.buf.length, 0));

    const items = []; const rejected: { name: string; reason: string }[] = [];
    for (const [idx, f] of files.entries()) {
      try {
        const sha = crypto.createHash('sha256').update(f.buf).digest('hex');
        const dup = await sqlOne<{ original_name: string }>('select original_name from project_images where project_id = $1 and sha256 = $2', [meta.project_id, sha]);
        if (dup) { rejected.push({ name: f.name, reason: `Exact duplicate of ${dup.original_name}` }); continue; }
        const id = crypto.randomUUID();
        const { kind, a, key, thumbKey } = await storeImage(req.user.id, meta.project_id, id, f.buf);
        const angle = ANGLES.includes(angleList[idx] as never) ? angleList[idx]! : meta.angle ?? 'custom';
        const row = await asUser(req.user.id, (db) => db.one(
          `insert into project_images (id, project_id, owner_id, storage_key, thumb_key, original_name, mime_type, size_bytes, width, height, sha256, dhash, angle, sort_order, quality)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,(select coalesce(max(sort_order),-1)+1 from project_images where project_id = $2),$14) returning *`,
          [id, meta.project_id, req.user.id, key, thumbKey, f.name, kind.mime, f.buf.length, a.width, a.height, a.sha256, a.dhash, angle, JSON.stringify(a.quality)]));
        items.push(await serializeImage(row!));
      } catch (e) {
        if (e instanceof AppError) rejected.push({ name: f.name, reason: e.message }); else throw e;
      }
    }
    await recalcStorage(req.user.id);
    await sql(`update projects set updated_at = now(), overlap_analysis = null where id = $1`, [meta.project_id]);
    reply.code(items.length ? 201 : 400);
    return { items, rejected, ...(items.length ? {} : { error: 'upload_rejected', message: rejected[0]?.reason ?? 'No images accepted' }) };
  });

  app.get('/uploads/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one(`${IMAGE_SELECT} where id = $1`, [id]));
    if (!row) throw notFound('Image');
    return serializeImage(row);
  });

  app.patch('/uploads/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ angle: z.enum(ANGLES).optional(), custom_label: z.string().trim().max(60).nullable().optional() }), req.body);
    const row = await asUser(req.user.id, (db) => db.one(
      'update project_images set angle = coalesce($1, angle), custom_label = case when $3 then $2 else custom_label end where id = $4 returning *',
      [body.angle ?? null, body.custom_label ?? null, body.custom_label !== undefined, id]));
    if (!row) throw notFound('Image');
    return serializeImage(row);
  });

  /** Replace the file of an existing image, keeping its id, angle and position. */
  app.post('/uploads/:id/replace', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const existing = await asUser(req.user.id, (db) => db.one(`${IMAGE_SELECT} where id = $1 and owner_id = $2`, [id, req.user.id]));
    if (!existing) throw notFound('Image');
    const part = await req.file();
    if (!part) throw badRequest('No file received');
    const buf = await readFile(part);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (await sqlOne('select 1 from project_images where project_id = $1 and sha256 = $2 and id <> $3', [existing.project_id, sha, id])) throw badRequest('This file is already in the project');
    await storage.delete(existing.storage_key);
    const { kind, a, key, thumbKey } = await storeImage(req.user.id, existing.project_id, id, buf);
    const row = await asUser(req.user.id, (db) => db.one(
      `update project_images set storage_key=$1, thumb_key=$2, original_name=$3, mime_type=$4, size_bytes=$5, width=$6, height=$7, sha256=$8, dhash=$9, quality=$10 where id=$11 returning *`,
      [key, thumbKey, part.filename.slice(0, 200), kind.mime, buf.length, a.width, a.height, a.sha256, a.dhash, JSON.stringify(a.quality), id]));
    await recalcStorage(req.user.id);
    await sql('update projects set overlap_analysis = null where id = $1', [existing.project_id]);
    return serializeImage(row!);
  });

  app.delete('/uploads/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one('delete from project_images where id = $1 and owner_id = $2 returning storage_key, thumb_key, project_id', [id, req.user.id]));
    if (!row) throw notFound('Image');
    await Promise.all([storage.delete(row.storage_key), storage.delete(row.thumb_key)]);
    await sql('update projects set cover_image_id = null where cover_image_id = $1', [id]);
    await sql('update projects set overlap_analysis = null where id = $1', [row.project_id]);
    await recalcStorage(req.user.id);
    return { ok: true };
  });

  app.get('/projects/:id/images', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const rows = await asUser(req.user.id, (db) => db.all(`${IMAGE_SELECT} where project_id = $1 order by sort_order, created_at`, [id]));
    return { items: await Promise.all(rows.map(serializeImage)) };
  });

  app.put('/projects/:id/images/order', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { ids } = parse(z.object({ ids: z.array(uuid).max(1000) }), req.body);
    await asUser(req.user.id, async (db) => {
      for (const [i, imageId] of ids.entries()) await db.all('update project_images set sort_order = $1 where id = $2 and project_id = $3', [i, imageId, id]);
    });
    return { ok: true };
  });

  app.get('/projects/:id/analysis', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return asUser(req.user.id, async (db) => {
      const p = await db.one('select overlap_analysis from projects where id = $1', [id]);
      if (!p) throw notFound('Project');
      const imgs = await db.all('select id, angle, dhash, sha256, quality from project_images where project_id = $1 order by sort_order', [id]);
      return analyzeDataset(imgs, p.overlap_analysis);
    });
  });

  /** Feature-overlap check (ORB + RANSAC) — measures whether the set can work for photogrammetry. */
  app.post('/projects/:id/analysis/overlap', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const imgs = await asUser(req.user.id, (db) => db.all<{ id: string; storage_key: string }>('select id, storage_key from project_images where project_id = $1 order by sort_order', [id]));
    if (imgs.length < 2) throw badRequest('Upload at least two images to check overlap');
    const work = await makeWorkDir('overlap');
    try {
      const input = { images: await Promise.all(imgs.map(async (i) => ({ id: i.id, path: await materialize(i.storage_key, work) }))), max_pairs: 600 };
      const inPath = path.join(work, 'in.json'); await fs.writeFile(inPath, JSON.stringify(input));
      const r = await run(config.PYTHON_BIN, [workerScript('model-processing', 'overlap.py'), inPath], { timeoutMs: 180_000 });
      if (r.code !== 0) { req.log.error({ stderr: r.stderr.slice(-2000) }, 'overlap failed'); throw new AppError(500, 'analysis_failed', r.timedOut ? 'Overlap analysis timed out' : 'Overlap analysis failed'); }
      const result = JSON.parse(r.stdout);
      await asUser(req.user.id, (db) => db.all('update projects set overlap_analysis = $1 where id = $2', [JSON.stringify(result), id]));
      return result;
    } finally { await fs.rm(work, { recursive: true, force: true }); }
  });
}
