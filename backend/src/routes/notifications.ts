import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.get('/notifications', async (req) => asUser(req.user.id, async (db) => {
    const items = await db.all('select id, kind, title, body, link, read_at, created_at from notifications order by created_at desc limit 100');
    const unread = await db.one<{ n: number }>('select count(*)::int as n from notifications where read_at is null');
    return { items, unread: unread?.n ?? 0 };
  }));
  app.post('/notifications/:id/read', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    await asUser(req.user.id, (db) => db.all('update notifications set read_at = coalesce(read_at, now()) where id = $1', [id]));
    return { ok: true };
  });
  app.post('/notifications/read-all', async (req) => {
    await asUser(req.user.id, (db) => db.all('update notifications set read_at = now() where read_at is null'));
    return { ok: true };
  });
  app.delete('/notifications/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    await asUser(req.user.id, (db) => db.all('delete from notifications where id = $1', [id]));
    return { ok: true };
  });
}
