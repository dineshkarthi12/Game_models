import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { storage } from '../storage/index.js';
import { settingsSchema, startGeneration, getGeneration } from './generations.js';
import { cancelGeneration } from '../services/generations.js';

export async function reconstructionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/reconstruction', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(z.object({ project_id: uuid, image_ids: z.array(uuid).max(500).optional(), settings: settingsSchema }), req.body);
    const id = await startGeneration(req.user.id, { project_id: body.project_id, mode: 'photogrammetry', provider: 'colmap', image_ids: body.image_ids, settings: body.settings });
    reply.code(201);
    return getGeneration(req.user.id, id);
  });

  app.get('/reconstruction/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const gen = await getGeneration(req.user.id, id);
    const job = await asUser(req.user.id, (db) => db.one('select * from reconstruction_jobs where generation_id = $1', [id]));
    if (!job) throw notFound('Reconstruction');
    const sign = (k: string | null) => (k ? storage.signedUrl(k, { expiresIn: 3600 }) : null);
    return {
      ...gen,
      reconstruction: {
        status: job.status, stage: job.stage, colmap_version: job.colmap_version, dense_mode: job.dense_mode, total_images: job.total_images,
        registered_images: job.registered_images, sparse_points: job.sparse_points, mean_reprojection_error: job.mean_reprojection_error,
        mean_track_length: job.mean_track_length, mesh_vertices: job.mesh_vertices, mesh_faces: job.mesh_faces, scale_factor: job.scale_factor,
        scale_source: job.scale_source, metrics: job.metrics,
        point_cloud_url: await sign(job.point_cloud_key), cameras_url: await sign(job.cameras_key), log_url: await sign(job.log_key),
      },
    };
  });

  app.post('/reconstruction/:id/cancel', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    await getGeneration(req.user.id, id);
    if (!(await cancelGeneration(id, req.user.id))) throw badRequest('Only queued or running reconstructions can be cancelled');
    return getGeneration(req.user.id, id);
  });

  /** Reconstructions list for the Precision Studio. */
  app.get('/reconstruction', async (req) => asUser(req.user.id, async (db) => ({
    items: await db.all(`select g.id, g.project_id, p.name as project_name, g.status, g.stage, g.created_at, g.completed_at, g.model_id, g.metrics,
        r.registered_images, r.total_images, r.mean_reprojection_error, r.dense_mode, r.scale_source
      from generations g join projects p on p.id = g.project_id left join reconstruction_jobs r on r.generation_id = g.id
      where g.mode = 'photogrammetry' order by g.created_at desc limit 100`),
  })));
}
