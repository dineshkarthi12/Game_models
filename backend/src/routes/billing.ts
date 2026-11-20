import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, pagination } from '../utils/validate.js';
import { AppError } from '../utils/errors.js';
import { PLANS } from '../services/plans.js';
import { getBalance } from '../services/credits.js';

export async function billingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/billing', async (req) => asUser(req.user.id, async (db) => {
    const sub = await db.one('select plan, status, provider, current_period_end, created_at from subscriptions where user_id = $1', [req.user.id]);
    const prof = await db.one('select storage_used_bytes, storage_quota_bytes from profiles where user_id = $1', [req.user.id]);
    return { subscription: sub, balance: await getBalance(req.user.id), storage: prof, payments_enabled: false, plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })) };
  }));

  /** Credit ledger with running balance (window function over the user's own rows; RLS applies). */
  app.get('/billing/transactions', async (req) => {
    const q = parse(pagination, req.query);
    return asUser(req.user.id, async (db) => {
      const total = await db.one<{ n: number }>('select count(*)::int as n from credit_transactions');
      const items = await db.all(`select * from (
          select id, amount, reason, reference_type, reference_id, created_at, sum(amount) over (order by created_at, id) as balance_after from credit_transactions
        ) t order by created_at desc, id desc limit $1 offset $2`, [q.page_size, (q.page - 1) * q.page_size]);
      return { items, total: total?.n ?? 0, page: q.page, page_size: q.page_size };
    });
  });

  app.post('/billing/checkout', async (req) => {
    parse(z.object({ plan: z.enum(['pro', 'studio']) }), req.body);
    throw new AppError(503, 'payments_not_configured', 'Online payments are not configured for this deployment (CONFIGURATION REQUIRED). An administrator can change plans with `npm run set-plan -w backend`.');
  });
}
