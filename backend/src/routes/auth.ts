import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { asUser, sql, sqlOne, transaction } from '../database/pool.js';
import { signAccessToken, sha256, randomToken } from '../auth/tokens.js';
import { getPublicUser, provisionUser } from '../auth/users.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../utils/errors.js';
import { sendEmail } from '../services/email.js';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'must be at least 8 characters').max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'must contain letters and numbers');

function localOnly() {
  if (config.AUTH_MODE !== 'local') throw new AppError(400, 'auth_mode', 'This endpoint is handled by Supabase Auth in this deployment');
}

async function createSession(userId: string, ua: string | undefined, ip: string) {
  const s = await sqlOne<{ id: string }>('insert into sessions (user_id, user_agent, ip) values ($1,$2,$3) returning id', [userId, ua?.slice(0, 300) ?? null, ip]);
  return s!.id;
}

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: config.isTest ? 1000 : 10, timeWindow: '1 minute' } } };

  app.get('/auth/config', async () => ({ mode: config.AUTH_MODE, google: config.AUTH_MODE === 'supabase' }));

  app.post('/auth/register', strict, async (req, reply) => {
    localOnly();
    const body = parse(z.object({ email, password, full_name: z.string().trim().min(1).max(120).optional() }), req.body);
    const exists = await sqlOne('select 1 from users where lower(email) = $1', [body.email]);
    if (exists) throw conflict('An account with this email already exists');
    const hash = await bcrypt.hash(body.password, 12);
    const userId = await transaction(async (c) => {
      const u = await c.query<{ id: string }>(`insert into users (email, password_hash, auth_provider) values ($1,$2,'local') returning id`, [body.email, hash]);
      const id = u.rows[0]!.id;
      await provisionUser(c, id, body.full_name ?? null);
      return id;
    });
    const sid = await createSession(userId, req.headers['user-agent'], req.ip);
    reply.code(201);
    return { token: await signAccessToken(userId, sid, body.email), user: await getPublicUser(userId) };
  });

  app.post('/auth/login', strict, async (req) => {
    localOnly();
    const body = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
    const u = await sqlOne<{ id: string; password_hash: string | null }>('select id, password_hash from users where lower(email) = $1', [body.email]);
    // Constant-ish time: always run bcrypt compare.
    const ok = await bcrypt.compare(body.password, u?.password_hash ?? '$2a$12$0000000000000000000000000000000000000000000000000000');
    if (!u || !ok) throw unauthorized('Incorrect email or password');
    await sql('update users set last_login_at = now() where id = $1', [u.id]);
    const sid = await createSession(u.id, req.headers['user-agent'], req.ip);
    return { token: await signAccessToken(u.id, sid, body.email), user: await getPublicUser(u.id) };
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (req) => {
    if (req.user.sessionId) await sql('update sessions set revoked_at = now() where id = $1', [req.user.sessionId]);
    return { ok: true };
  });

  app.post('/auth/forgot-password', strict, async (req) => {
    localOnly();
    const body = parse(z.object({ email }), req.body);
    const u = await sqlOne<{ id: string }>('select id from users where lower(email) = $1', [body.email]);
    if (u) {
      const token = randomToken();
      await sql(`insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1,$2, now() + interval '1 hour')`, [u.id, sha256(token)]);
      const link = `${config.PUBLIC_APP_URL}/reset-password?token=${token}`;
      await sendEmail(body.email, 'Reset your Vistora 3D password', `Use this link within 1 hour to reset your password: ${link}`);
    }
    // Same response whether or not the account exists (no user enumeration).
    return { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
  });

  app.post('/auth/reset-password', strict, async (req) => {
    localOnly();
    const body = parse(z.object({ token: z.string().min(20).max(200), password }), req.body);
    const t = await sqlOne<{ id: string; user_id: string }>(
      'select id, user_id from password_reset_tokens where token_hash = $1 and used_at is null and expires_at > now()', [sha256(body.token)]);
    if (!t) throw badRequest('This reset link is invalid or has expired');
    await transaction(async (c) => {
      await c.query('update password_reset_tokens set used_at = now() where id = $1', [t.id]);
      await c.query('update users set password_hash = $1, updated_at = now() where id = $2', [await bcrypt.hash(body.password, 12), t.user_id]);
      await c.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [t.user_id]);
    });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const u = await getPublicUser(req.user.id);
    if (!u) throw notFound('User');
    return u;
  });

  app.patch('/auth/me', { preHandler: requireAuth }, async (req) => {
    const body = parse(z.object({
      full_name: z.string().trim().max(120).nullable().optional(),
      company: z.string().trim().max(120).nullable().optional(),
      job_title: z.string().trim().max(120).nullable().optional(),
      avatar_url: z.string().url().max(500).nullable().optional(),
      preferences: z.record(z.unknown()).optional(),
    }), req.body);
    await asUser(req.user.id, async (db) => {
      const sets: string[] = []; const vals: unknown[] = [];
      for (const [k, v] of Object.entries(body)) {
        if (v === undefined) continue;
        vals.push(k === 'preferences' ? JSON.stringify(v) : v);
        sets.push(k === 'preferences' ? `preferences = preferences || $${vals.length}::jsonb` : `${k} = $${vals.length}`);
      }
      if (sets.length) await db.all(`update profiles set ${sets.join(', ')}, updated_at = now() where user_id = $${vals.length + 1}`, [...vals, req.user.id]);
    });
    return getPublicUser(req.user.id);
  });

  app.post('/auth/change-password', { preHandler: requireAuth }, async (req) => {
    localOnly();
    const body = parse(z.object({ current_password: z.string().min(1), new_password: password }), req.body);
    const u = await sqlOne<{ password_hash: string }>('select password_hash from users where id = $1', [req.user.id]);
    if (!u || !(await bcrypt.compare(body.current_password, u.password_hash))) throw badRequest('Current password is incorrect');
    await sql('update users set password_hash = $1, updated_at = now() where id = $2', [await bcrypt.hash(body.new_password, 12), req.user.id]);
    await sql('update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null', [req.user.id, req.user.sessionId]);
    return { ok: true };
  });

  app.get('/auth/sessions', { preHandler: requireAuth }, async (req) => {
    const rows = await asUser(req.user.id, (db) => db.all(
      `select id, user_agent, ip, created_at, last_seen_at from sessions where user_id = $1 and revoked_at is null order by last_seen_at desc limit 50`, [req.user.id]));
    return { items: rows.map((r) => ({ ...r, current: r.id === req.user.sessionId })) };
  });

  app.delete('/auth/sessions/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await asUser(req.user.id, (db) => db.all('update sessions set revoked_at = now() where id = $1 and user_id = $2 returning id', [id, req.user.id]));
    if (!r.length) throw notFound('Session');
    return { ok: true };
  });

  app.delete('/auth/me', { preHandler: requireAuth }, async (req) => {
    const body = parse(z.object({ confirm: z.literal('DELETE') }), req.body);
    void body;
    await sql('delete from users where id = $1', [req.user.id]);
    return { ok: true };
  });
}
