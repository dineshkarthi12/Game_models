import type { FastifyInstance } from 'fastify';
import { PLANS } from '../services/plans.js';

export async function registerExtraRoutes(api: FastifyInstance) {
  api.get('/plans', async () => ({
    payments_enabled: false,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
  }));
}
