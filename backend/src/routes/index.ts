import type { FastifyInstance } from 'fastify';
import { PLANS } from '../services/plans.js';
import { projectRoutes } from './projects.js';
import { libraryRoutes } from './library.js';
import { fileRoutes } from './files.js';
import { uploadRoutes } from './uploads.js';
import { generationRoutes } from './generations.js';
import { reconstructionRoutes } from './reconstruction.js';
import { modelRoutes } from './models.js';
import { processingRoutes } from './processing.js';
import { exportRoutes } from './exports.js';
import { teamRoutes } from './teams.js';
import { billingRoutes } from './billing.js';
import { requireAuth } from '../middleware/auth.js';
import { systemMetrics } from '../services/maintenance.js';
import { pool } from '../database/pool.js';
import { redis } from '../jobs/queues.js';
import { storage } from '../storage/index.js';

export async function registerExtraRoutes(api: FastifyInstance) {
  api.get('/plans', async () => ({
    payments_enabled: false,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
  }));
  await api.register(fileRoutes);
  await api.register(projectRoutes);
  await api.register(libraryRoutes);
  await api.register(uploadRoutes);
  await api.register(generationRoutes);
  await api.register(reconstructionRoutes);
  await api.register(modelRoutes);
  await api.register(processingRoutes);
  await api.register(exportRoutes);
  await api.register(teamRoutes);
  await api.register(billingRoutes);
  api.get('/system/metrics', { preHandler: requireAuth }, async () => systemMetrics());
  /** Readiness: database, Redis and storage reachable. */
  api.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, string> = {};
    await pool.query('select 1').then(() => { checks.database = 'ok'; }).catch((e) => { checks.database = String(e.message); });
    await redis().ping().then(() => { checks.redis = 'ok'; }).catch((e) => { checks.redis = String(e.message); });
    await storage.size('health-check-nonexistent').then(() => { checks.storage = 'ok'; }).catch((e) => { checks.storage = String(e.message); });
    const ok = Object.values(checks).every((v) => v === 'ok');
    reply.code(ok ? 200 : 503); return { ok, checks };
  });
}
