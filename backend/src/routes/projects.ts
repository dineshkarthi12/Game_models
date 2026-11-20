import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser, sql } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid, pagination } from '../utils/validate.js';
import { notFound, forbidden } from '../utils/errors.js';
import { serializeProject } from '../services/serializers.js';
import { storage } from '../storage/index.js';
import { recalcStorage } from '../services/storageUsage.js';

export const CATEGORIES = ['human', 'animal', 'creature', 'vehicle', 'building', 'furniture', 'product', 'mechanical', 'game_prop', 'environment', 'custom'] as const;

export const PROJECT_SELECT = `
  select p.*,
    (select count(*) from project_images i where i.project_id = p.id)::int as image_count,
    (select count(*) from models m where m.project_id = p.id)::int as model_count,
    (select count(*) from generations g where g.project_id = p.id)::int as generation_count,
    coalesce(ci.thumb_key, (select i2.thumb_key from project_images i2 where i2.project_id = p.id order by i2.sort_order, i2.created_at limit 1)) as cover_key
  from projects p left join project_images ci on ci.id = p.cover_image_id`;

const SORTS: Record<string, string> = { updated: 'p.updated_at', created: 'p.created_at', name: 'lower(p.name)' };

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/projects', async (req) => {
    const q = parse(pagination.extend({
      q: z.string().trim().max(100).optional(), category: z.enum(CATEGORIES).optional(),
      status: z.enum(['draft', 'processing', 'completed', 'failed']).optional(),
      sort: z.enum(['updated', 'created', 'name']).default('updated'), order: z.enum(['asc', 'desc']).default('desc'),
    }), req.query);
    return asUser(req.user.id, async (db) => {
      const where: string[] = []; const params: unknown[] = [];
      if (q.q) { params.push(`%${q.q}%`); where.push(`(p.name ilike $${params.length} or p.description ilike $${params.length})`); }
      if (q.category) { params.push(q.category); where.push(`p.category = $${params.length}`); }
      if (q.status) { params.push(q.status); where.push(`p.status = $${params.length}`); }
      const w = where.length ? `where ${where.join(' and ')}` : '';
      const total = await db.one<{ n: number }>(`select count(*)::int as n from projects p ${w}`, params);
      params.push(q.page_size, (q.page - 1) * q.page_size);
      const rows = await db.all(`${PROJECT_SELECT} ${w} order by ${SORTS[q.sort]} ${q.order}, p.id limit $${params.length - 1} offset $${params.length}`, params);
      return { items: await Promise.all(rows.map(serializeProject)), total: total?.n ?? 0, page: q.page, page_size: q.page_size };
    });
  });

  app.post('/projects', async (req, reply) => {
    const body = parse(z.object({
      name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).nullable().optional(),
      category: z.enum(CATEGORIES).default('custom'), team_id: uuid.nullable().optional(),
    }), req.body);
    const row = await asUser(req.user.id, async (db) => {
      if (body.team_id) {
        const ok = await db.one('select app_is_team_member($1) as ok', [body.team_id]);
        if (!ok?.ok) throw forbidden('You are not a member of that team');
      }
      const p = await db.one<{ id: string }>('insert into projects (owner_id, name, description, category, team_id) values ($1,$2,$3,$4,$5) returning id',
        [req.user.id, body.name, body.description ?? null, body.category, body.team_id ?? null]);
      return db.one(`${PROJECT_SELECT} where p.id = $1`, [p!.id]);
    });
    reply.code(201);
    return serializeProject(row!);
  });

  app.get('/projects/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = await asUser(req.user.id, (db) => db.one(`${PROJECT_SELECT} where p.id = $1`, [id]));
    if (!row) throw notFound('Project');
    return serializeProject(row);
  });

  app.put('/projects/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({
      name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(2000).nullable().optional(),
      category: z.enum(CATEGORIES).optional(), cover_image_id: uuid.nullable().optional(), team_id: uuid.nullable().optional(),
    }), req.body);
    const row = await asUser(req.user.id, async (db) => {
      const sets: string[] = []; const vals: unknown[] = [];
      for (const [k, v] of Object.entries(body)) { if (v === undefined) continue; vals.push(v); sets.push(`${k} = $${vals.length}`); }
      if (sets.length) {
        vals.push(id);
        const r = await db.all(`update projects set ${sets.join(', ')} where id = $${vals.length} returning id`, vals);
        if (!r.length) throw notFound('Project');
      }
      return db.one(`${PROJECT_SELECT} where p.id = $1`, [id]);
    });
    if (!row) throw notFound('Project');
    return serializeProject(row);
  });

  app.delete('/projects/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const modelIds = await asUser(req.user.id, async (db) => {
      const own = await db.one('select id from projects where id = $1 and owner_id = $2', [id, req.user.id]);
      if (!own) throw notFound('Project');
      const models = await db.all<{ id: string }>('select id from models where project_id = $1', [id]);
      await db.all('delete from projects where id = $1', [id]);
      return models.map((m) => m.id);
    });
    // Remove stored files after the rows are gone.
    await storage.deletePrefix(`users/${req.user.id}/projects/${id}/`);
    for (const mid of modelIds) await storage.deletePrefix(`users/${req.user.id}/models/${mid}/`);
    await recalcStorage(req.user.id);
    return { ok: true };
  });

  /** Project data export: JSON manifest of the project, its images, generations and models (files via signed URLs). */
  app.get('/projects/:id/manifest', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return asUser(req.user.id, async (db) => {
      const project = await db.one('select * from projects where id = $1', [id]);
      if (!project) throw notFound('Project');
      const images = await db.all('select id, original_name, angle, width, height, size_bytes, sha256, quality, created_at from project_images where project_id = $1 order by sort_order', [id]);
      const generations = await db.all('select id, mode, provider, status, settings, used_image_ids, metrics, created_at, completed_at from generations where project_id = $1 order by created_at', [id]);
      const models = await db.all(`select m.id, m.name, m.source, m.provider, m.is_demo, m.created_at,
        (select json_agg(json_build_object('version', v.version, 'label', v.label, 'operation', v.operation, 'params', v.params, 'file_size', v.file_size, 'created_at', v.created_at) order by v.version)
         from model_versions v where v.model_id = m.id) as versions from models m where m.project_id = $1`, [id]);
      return { format: 'vistora-project-manifest@1', exported_at: new Date().toISOString(), project, images, generations, models };
    });
  });

  void sql;
}
