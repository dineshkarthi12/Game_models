import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid, pagination } from '../utils/validate.js';
import { notFound, conflict } from '../utils/errors.js';
import { serializeModel, serializeProject, serializeGeneration } from '../services/serializers.js';
import { MODEL_SELECT, duplicateModel } from '../services/models.js';
import { CATEGORIES, PROJECT_SELECT } from './projects.js';
import { storage } from '../storage/index.js';
import { recalcStorage } from '../services/storageUsage.js';
import { getBalance } from '../services/credits.js';

const MODEL_SORTS: Record<string, string> = { created: 'm.created_at', updated: 'm.updated_at', name: 'lower(m.name)' };

export async function libraryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/dashboard', async (req) => asUser(req.user.id, async (db) => {
    const t = await db.one(`select
      (select count(*) from projects)::int as projects,
      (select count(*) from models where status = 'ready')::int as models,
      (select count(*) from generations where status in ('queued','running'))::int
        + (select count(*) from processing_jobs where status in ('queued','running'))::int
        + (select count(*) from export_jobs where status in ('queued','running'))::int as processing_jobs,
      (select count(*) from export_jobs where status = 'succeeded')::int as exports,
      (select storage_used_bytes from profiles where user_id = $1) as storage_used_bytes,
      (select storage_quota_bytes from profiles where user_id = $1) as storage_quota_bytes`, [req.user.id]);
    const projects = await db.all(`${PROJECT_SELECT} order by p.updated_at desc limit 6`);
    const gens = await db.all(`select g.*, p.name as project_name, j.provider_task_id from generations g join projects p on p.id = g.project_id
      left join lateral (select provider_task_id from generation_jobs where generation_id = g.id order by created_at desc limit 1) j on true
      order by g.created_at desc limit 6`);
    return {
      totals: { ...t, credits: await getBalance(req.user.id) },
      recent_projects: await Promise.all(projects.map(serializeProject)),
      recent_generations: gens.map(serializeGeneration),
    };
  }));

  // ── Models / asset library ──
  app.get('/models', async (req) => {
    const q = parse(pagination.extend({
      q: z.string().trim().max(100).optional(), category: z.enum(CATEGORIES).optional(), source: z.enum(['ai', 'photogrammetry', 'upload']).optional(),
      favorite: z.enum(['true', 'false']).optional(), folder_id: z.union([uuid, z.literal('none')]).optional(), tag: z.string().max(40).optional(),
      project_id: uuid.optional(), from: z.string().date().optional(), to: z.string().date().optional(),
      sort: z.enum(['created', 'updated', 'name']).default('created'), order: z.enum(['asc', 'desc']).default('desc'),
    }), req.query);
    return asUser(req.user.id, async (db) => {
      const where: string[] = []; const p: unknown[] = [];
      const add = (cond: string, v: unknown) => { p.push(v); where.push(cond.replace('?', `$${p.length}`)); };
      if (q.q) add(`(m.name ilike ? or p.name ilike $${p.length + 1} or exists (select 1 from asset_tags t where t.model_id = m.id and t.tag ilike $${p.length + 1}))`, `%${q.q}%`);
      if (q.category) add('m.category = ?', q.category);
      if (q.source) add('m.source = ?', q.source);
      if (q.favorite) add('m.favorite = ?', q.favorite === 'true');
      if (q.folder_id === 'none') where.push('m.folder_id is null'); else if (q.folder_id) add('m.folder_id = ?', q.folder_id);
      if (q.tag) add('exists (select 1 from asset_tags t where t.model_id = m.id and t.tag = ?)', q.tag);
      if (q.project_id) add('m.project_id = ?', q.project_id);
      if (q.from) add('m.created_at >= ?::date', q.from);
      if (q.to) add(`m.created_at < (?::date + interval '1 day')`, q.to);
      const w = where.length ? `where ${where.join(' and ')}` : '';
      const total = await db.one<{ n: number }>(`select count(*)::int as n from models m join projects p on p.id = m.project_id ${w}`, p);
      p.push(q.page_size, (q.page - 1) * q.page_size);
      const rows = await db.all(`${MODEL_SELECT} ${w} order by ${MODEL_SORTS[q.sort]} ${q.order}, m.id limit $${p.length - 1} offset $${p.length}`, p);
      return { items: await Promise.all(rows.map(serializeModel)), total: total?.n ?? 0, page: q.page, page_size: q.page_size };
    });
  });

  app.get('/models/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one(`${MODEL_SELECT} where m.id = $1`, [id]));
    if (!row) throw notFound('Model');
    return serializeModel(row);
  });

  app.patch('/models/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({
      name: z.string().trim().min(1).max(120).optional(), favorite: z.boolean().optional(), folder_id: uuid.nullable().optional(),
      tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(), category: z.enum(CATEGORIES).optional(),
    }), req.body);
    const row = await asUser(req.user.id, async (db) => {
      const own = await db.one('select id from models where id = $1 and owner_id = $2', [id, req.user.id]);
      if (!own) throw notFound('Model');
      const sets: string[] = []; const vals: unknown[] = [];
      for (const k of ['name', 'favorite', 'folder_id', 'category'] as const) if (body[k] !== undefined) { vals.push(body[k]); sets.push(`${k} = $${vals.length}`); }
      if (sets.length) { vals.push(id); await db.all(`update models set ${sets.join(', ')} where id = $${vals.length}`, vals); }
      if (body.tags) {
        await db.all('delete from asset_tags where model_id = $1', [id]);
        for (const t of [...new Set(body.tags)]) await db.all('insert into asset_tags (owner_id, model_id, tag) values ($1,$2,$3)', [req.user.id, id, t]);
      }
      return db.one(`${MODEL_SELECT} where m.id = $1`, [id]);
    });
    return serializeModel(row!);
  });

  app.post('/models/:id/duplicate', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const src = await asUser(req.user.id, (db) => db.one('select name from models where id = $1 and owner_id = $2', [id, req.user.id]));
    if (!src) throw notFound('Model');
    const newId = await duplicateModel(req.user.id, id, `${src.name} (copy)`.slice(0, 120));
    await recalcStorage(req.user.id);
    const row = await asUser(req.user.id, (db) => db.one(`${MODEL_SELECT} where m.id = $1`, [newId]));
    reply.code(201);
    return serializeModel(row!);
  });

  /** Signed download URL for the model's current version (GLB). */
  app.get('/models/:id/download', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one(`select m.name, v.storage_key, v.version from models m join model_versions v on v.id = m.current_version_id where m.id = $1`, [id]));
    if (!row) throw notFound('Model file');
    const name = `${String(row.name).replace(/[^\w.-]+/g, '_')}_v${row.version}.glb`;
    return { url: await storage.signedUrl(row.storage_key, { expiresIn: 900, downloadName: name }), filename: name };
  });

  app.delete('/models/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    await asUser(req.user.id, async (db) => {
      const r = await db.all('delete from models where id = $1 and owner_id = $2 returning id', [id, req.user.id]);
      if (!r.length) throw notFound('Model');
    });
    await storage.deletePrefix(`users/${req.user.id}/models/${id}/`);
    await recalcStorage(req.user.id);
    return { ok: true };
  });

  // ── Folders ──
  app.get('/folders', async (req) => asUser(req.user.id, async (db) => ({
    items: await db.all(`select f.id, f.name, f.created_at, (select count(*) from models m where m.folder_id = f.id)::int as model_count from asset_folders f order by lower(f.name)`),
  })));
  app.post('/folders', async (req, reply) => {
    const body = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    const row = await asUser(req.user.id, async (db) => {
      if (await db.one('select 1 from asset_folders where owner_id = $1 and lower(name) = lower($2)', [req.user.id, body.name])) throw conflict('A folder with that name already exists');
      return db.one('insert into asset_folders (owner_id, name) values ($1,$2) returning id, name, created_at, 0 as model_count', [req.user.id, body.name]);
    });
    reply.code(201); return row;
  });
  app.patch('/folders/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    const r = await asUser(req.user.id, (db) => db.one('update asset_folders set name = $1 where id = $2 returning id, name, created_at', [body.name, id]));
    if (!r) throw notFound('Folder');
    return r;
  });
  app.delete('/folders/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await asUser(req.user.id, (db) => db.all('delete from asset_folders where id = $1 returning id', [id]));
    if (!r.length) throw notFound('Folder');
    return { ok: true };
  });
  app.get('/tags', async (req) => asUser(req.user.id, async (db) => ({
    items: await db.all('select tag, count(*)::int as count from asset_tags group by tag order by count(*) desc, tag limit 100'),
  })));

  // ── Generation history ──
  app.get('/generations', async (req) => {
    const q = parse(pagination.extend({
      status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(), mode: z.enum(['ai', 'photogrammetry']).optional(),
      project_id: uuid.optional(), q: z.string().trim().max(100).optional(),
    }), req.query);
    return asUser(req.user.id, async (db) => {
      const where: string[] = []; const p: unknown[] = [];
      if (q.status) { p.push(q.status); where.push(`g.status = $${p.length}`); }
      if (q.mode) { p.push(q.mode); where.push(`g.mode = $${p.length}`); }
      if (q.project_id) { p.push(q.project_id); where.push(`g.project_id = $${p.length}`); }
      if (q.q) { p.push(`%${q.q}%`); where.push(`(p.name ilike $${p.length} or g.provider ilike $${p.length})`); }
      const w = where.length ? `where ${where.join(' and ')}` : '';
      const total = await db.one<{ n: number }>(`select count(*)::int as n from generations g join projects p on p.id = g.project_id ${w}`, p);
      p.push(q.page_size, (q.page - 1) * q.page_size);
      const rows = await db.all(`select g.*, p.name as project_name, j.provider_task_id from generations g join projects p on p.id = g.project_id
        left join lateral (select provider_task_id from generation_jobs where generation_id = g.id order by created_at desc limit 1) j on true
        ${w} order by g.created_at desc limit $${p.length - 1} offset $${p.length}`, p);
      return { items: rows.map(serializeGeneration), total: total?.n ?? 0, page: q.page, page_size: q.page_size };
    });
  });
}
