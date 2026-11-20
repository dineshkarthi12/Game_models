import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { enqueue } from '../jobs/queues.js';
import { GAME_PRESETS } from '../services/gamePipeline.js';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const opSchema = z.union([
  z.object({ op: z.literal('cleanup'), merge_distance: z.number().min(0).max(0.1).optional(), min_component_ratio: z.number().min(0).max(0.5).optional() }),
  z.object({ op: z.literal('smooth'), iterations: z.number().int().min(1).max(50).optional(), factor: z.number().min(0.01).max(2).optional() }),
  z.object({ op: z.literal('decimate'), target_triangles: z.number().int().min(100).max(5_000_000).optional(), ratio: z.number().min(0.001).max(1).optional() }),
  z.object({ op: z.literal('remesh'), resolution: z.number().int().min(20).max(800).optional(), voxel_size: z.number().positive().optional(), adaptivity: z.number().min(0).max(1).optional() }),
  z.object({ op: z.literal('normals'), shading: z.enum(['smooth', 'flat']).optional() }),
  z.object({ op: z.literal('fill_holes'), max_sides: z.number().int().min(0).max(100000).optional() }),
  z.object({ op: z.literal('scale'), factor: z.number().positive().max(10000).optional(), axis: z.enum(['x', 'y', 'z', 'longest']).optional(), value: z.number().positive().optional(), unit: z.enum(['mm', 'cm', 'm', 'in']).optional() })
    .refine((o) => o.factor || (o.value && o.unit), 'scale needs factor, or value + unit'),
  z.object({ op: z.literal('material'), name: z.string().max(120).optional(), base_color: hex.optional(), roughness: z.number().min(0).max(1).optional(), metallic: z.number().min(0).max(1).optional() }),
  z.object({ op: z.literal('uv_unwrap'), angle: z.number().min(1).max(89).optional(), margin: z.number().min(0).max(0.1).optional() }),
  z.object({ op: z.literal('triangulate') }),
  z.object({ op: z.literal('place_on_ground') }),
  z.object({ op: z.literal('texture_enhance'), amount: z.number().min(0).max(2).optional(), contrast: z.number().min(0).max(5).optional() }),
]) as unknown as z.ZodType<{ op: string; [k: string]: unknown }>;

export const measurementsSchema = z.object({
  width: z.number().positive().optional(), height: z.number().positive().optional(), depth: z.number().positive().optional(), unit: z.enum(['mm', 'cm', 'm', 'in']).default('cm'),
});

const JOB_COLS = 'id, model_id, version_id, kind, status, params, result_version_id, error, created_at, completed_at';

export async function processingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  async function versionFor(userId: string, modelId: string, versionId?: string) {
    const m = await asUser(userId, (db) => db.one('select current_version_id, status from models where id = $1 and owner_id = $2', [modelId, userId]));
    if (!m) throw notFound('Model');
    const vid = versionId ?? m.current_version_id;
    if (!vid) throw badRequest('The model has no version yet');
    const v = await asUser(userId, (db) => db.one('select id from model_versions where id = $1 and model_id = $2', [vid, modelId]));
    if (!v) throw notFound('Version');
    return vid as string;
  }

  app.post('/models/:id/validate', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ version_id: uuid.optional(), measurements: measurementsSchema.optional() }), req.body ?? {});
    const vid = await versionFor(req.user.id, id, body.version_id);
    const job = await asUser(req.user.id, (db) => db.one(`insert into processing_jobs (owner_id, model_id, version_id, kind, params) values ($1,$2,$3,'validate',$4) returning ${JOB_COLS}`,
      [req.user.id, id, vid, JSON.stringify({ measurements: body.measurements ?? null })]));
    await enqueue('processing', 'validate', { jobId: job.id });
    reply.code(202); return job;
  });

  app.get('/models/:id/quality-report', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { version_id } = parse(z.object({ version_id: uuid.optional() }), req.query);
    const row = await asUser(req.user.id, async (db) => {
      const vid = version_id ?? (await db.one('select current_version_id from models where id = $1', [id]))?.current_version_id;
      return db.one('select id, model_id, version_id, report, created_at from validation_reports where model_id = $1 and version_id = $2 order by created_at desc limit 1', [id, vid]);
    });
    if (!row) return { report: null };
    return { report: { id: row.id, model_id: row.model_id, version_id: row.version_id, created_at: row.created_at, ...row.report } };
  });

  app.post('/models/:id/refine', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ version_id: uuid.optional(), label: z.string().trim().max(120).optional(), operations: z.array(opSchema).min(1).max(12) }), req.body);
    const vid = await versionFor(req.user.id, id, body.version_id);
    const job = await asUser(req.user.id, (db) => db.one(`insert into processing_jobs (owner_id, model_id, version_id, kind, params) values ($1,$2,$3,'refine',$4) returning ${JOB_COLS}`,
      [req.user.id, id, vid, JSON.stringify({ ops: body.operations, label: body.label })]));
    await enqueue('processing', 'refine', { jobId: job.id }, { attempts: 1 });
    reply.code(202); return job;
  });

  app.get('/game-presets', async () => ({ items: Object.entries(GAME_PRESETS).map(([id, p]) => ({ id, ...p })) }));

  app.post('/models/:id/optimize', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({
      version_id: uuid.optional(), preset: z.string().max(40).default('custom'),
      budget: z.number().int().min(200).max(500_000), texture: z.union([z.literal(256), z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]),
      lods: z.array(z.number().gt(0).max(1)).min(1).max(5).refine((a) => a[0] === 1 && a.every((x, i) => i === 0 || x < a[i - 1]!), 'lods must start at 1 and decrease'),
      collision: z.enum(['convex', 'box', 'none']).default('convex'), normal_map: z.boolean().default(true), retopology: z.boolean().default(false),
    }), req.body);
    const vid = await versionFor(req.user.id, id, body.version_id);
    const job = await asUser(req.user.id, (db) => db.one(`insert into processing_jobs (owner_id, model_id, version_id, kind, params) values ($1,$2,$3,'optimize',$4) returning ${JOB_COLS}`,
      [req.user.id, id, vid, JSON.stringify(body)]));
    await enqueue('processing', 'optimize', { jobId: job.id }, { attempts: 1 });
    reply.code(202); return job;
  });

  app.get('/models/:id/jobs', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return { items: await asUser(req.user.id, (db) => db.all(`select ${JOB_COLS} from processing_jobs where model_id = $1 order by created_at desc limit 50`, [id])) };
  });

  app.get('/processing-jobs/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = await asUser(req.user.id, (db) => db.one(`select ${JOB_COLS} from processing_jobs where id = $1`, [id]));
    if (!j) throw notFound('Job');
    return j;
  });
}
