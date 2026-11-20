import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid, pagination } from '../utils/validate.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';
import { storage } from '../storage/index.js';
import { enqueue } from '../jobs/queues.js';
import { EXPORT_FORMATS, EXPORT_PRESETS } from '../services/exportPresets.js';
import { recalcStorage } from '../services/storageUsage.js';

const settingsSchema = z.object({
  scale: z.number().positive().max(10000).default(1), units: z.enum(['m', 'cm', 'mm']).default('m'), up_axis: z.enum(['Y', 'Z']).default('Y'),
  forward_axis: z.enum(['-Z', 'Z', 'Y', '-Y', 'X', '-X']).default('-Z'), texture_resolution: z.enum(['original', '1k', '2k', '4k']).default('original'),
  include_textures: z.boolean().default(true), include_materials: z.boolean().default(true), include_normals: z.boolean().default(true), include_uvs: z.boolean().default(true),
  include_skeleton: z.boolean().default(true), include_animation: z.boolean().default(true), include_collision: z.boolean().default(false),
  lods: z.array(z.number().int().min(1).max(6)).max(6).default([]), triangulate: z.boolean().default(true),
});
const EXPORT_COLS = `e.id, e.model_id, e.version_id, e.preset, e.formats, e.settings, e.status, e.stage, e.error, e.files, e.package_size, e.package_key, e.created_at, e.completed_at`;

async function serialize(r: Record<string, unknown> & { package_key?: string | null }) {
  const { package_key, ...rest } = r;
  return { ...rest, download_url: package_key && r.status === 'succeeded' ? `/api/exports/${r.id}/download` : null };
}

export async function exportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/export-presets', async () => ({ formats: EXPORT_FORMATS, items: Object.entries(EXPORT_PRESETS).map(([id, p]) => ({ id, ...p })) }));

  app.post('/models/:id/export', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ version_id: uuid.optional(), preset: z.enum(Object.keys(EXPORT_PRESETS) as [string, ...string[]]), formats: z.array(z.enum(EXPORT_FORMATS)).min(1).max(7).optional(), settings: settingsSchema.partial().optional() }), req.body);
    const p = EXPORT_PRESETS[body.preset]!;
    const settings = settingsSchema.parse({ units: p.units, up_axis: p.up_axis, forward_axis: p.forward_axis, include_collision: p.collision, ...body.settings });
    const formats = [...new Set(body.formats ?? p.formats)];
    const row = await asUser(req.user.id, async (db) => {
      const m = await db.one('select current_version_id, status from models where id = $1 and owner_id = $2', [id, req.user.id]);
      if (!m) throw notFound('Model');
      const vid = body.version_id ?? m.current_version_id;
      if (!vid) throw badRequest('This model has no version to export');
      const meta = await db.one('select 1 from model_metadata where version_id = $1', [vid]);
      if (!meta) throw conflict('The model is still being analysed; try again in a moment.');
      return db.one(`insert into export_jobs as e (owner_id, model_id, version_id, preset, formats, settings) values ($1,$2,$3,$4,$5,$6) returning ${EXPORT_COLS}`,
        [req.user.id, id, vid, body.preset, formats, JSON.stringify(settings)]);
    });
    await enqueue('export', 'export', { exportId: row!.id }, { attempts: 1 });
    reply.code(202);
    return serialize(row!);
  });

  app.get('/exports', async (req) => {
    const q = parse(pagination.extend({ model_id: uuid.optional(), status: z.string().max(20).optional() }), req.query);
    return asUser(req.user.id, async (db) => {
      const w: string[] = []; const p: unknown[] = [];
      if (q.model_id) { p.push(q.model_id); w.push(`e.model_id = $${p.length}`); }
      if (q.status) { p.push(q.status); w.push(`e.status = $${p.length}`); }
      const where = w.length ? `where ${w.join(' and ')}` : '';
      const total = await db.one<{ n: number }>(`select count(*)::int as n from export_jobs e ${where}`, p);
      p.push(q.page_size, (q.page - 1) * q.page_size);
      const rows = await db.all(`select ${EXPORT_COLS}, m.name as model_name from export_jobs e join models m on m.id = e.model_id ${where} order by e.created_at desc limit $${p.length - 1} offset $${p.length}`, p);
      return { items: await Promise.all(rows.map(serialize)), total: total?.n ?? 0, page: q.page, page_size: q.page_size };
    });
  });

  app.get('/exports/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one(`select ${EXPORT_COLS}, m.name as model_name from export_jobs e join models m on m.id = e.model_id where e.id = $1`, [id]));
    if (!row) throw notFound('Export');
    return serialize(row);
  });

  /** Short-lived signed URL for the validated package. */
  app.get('/exports/:id/download', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one('select package_key, status from export_jobs where id = $1', [id]));
    if (!row) throw notFound('Export');
    if (row.status !== 'succeeded' || !row.package_key) throw badRequest('This export has no validated package');
    const url = await storage.signedUrl(row.package_key, { expiresIn: 600, downloadName: row.package_key.split('/').pop() });
    if ((req.query as { redirect?: string }).redirect === '1') return reply.redirect(url);
    return { url };
  });

  app.delete('/exports/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one('delete from export_jobs where id = $1 and owner_id = $2 returning package_key', [id, req.user.id]));
    if (!row) throw notFound('Export');
    if (row.package_key) await storage.delete(row.package_key);
    await recalcStorage(req.user.id);
    return { ok: true };
  });
}
