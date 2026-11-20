import type { FastifyInstance } from 'fastify';
import { PLANS } from '../services/plans.js';
import { projectRoutes } from './projects.js';
import { libraryRoutes } from './library.js';
import { fileRoutes } from './files.js';

export async function registerExtraRoutes(api: FastifyInstance) {
  api.get('/plans', async () => ({
    payments_enabled: false,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
  }));
  await api.register(fileRoutes);
  await api.register(projectRoutes);
  await api.register(libraryRoutes);
}
