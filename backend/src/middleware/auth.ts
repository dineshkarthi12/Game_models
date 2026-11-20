import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { sqlOne, sql } from '../database/pool.js';
import { verifyLocalToken, verifySupabaseToken } from '../auth/tokens.js';
import { ensureSupabaseUser } from '../auth/users.js';
import { unauthorized } from '../utils/errors.js';

export interface AuthUser { id: string; email: string; sessionId: string | null }
declare module 'fastify' {
  interface FastifyRequest { user: AuthUser }
}

const lastSeenWrites = new Map<string, number>();

export async function resolveUser(token: string): Promise<AuthUser> {
  if (config.AUTH_MODE === 'supabase') {
    const p = await verifySupabaseToken(token).catch(() => { throw unauthorized('Invalid or expired session'); });
    await ensureSupabaseUser(p.sub, p.email);
    return { id: p.sub, email: p.email, sessionId: null };
  }
  const p = await verifyLocalToken(token).catch(() => { throw unauthorized('Invalid or expired session'); });
  const s = await sqlOne<{ revoked_at: string | null }>('select revoked_at from sessions where id = $1 and user_id = $2', [p.sid, p.sub]);
  if (!s || s.revoked_at) throw unauthorized('Session has been signed out');
  const now = Date.now();
  if ((lastSeenWrites.get(p.sid) ?? 0) < now - 5 * 60_000) {
    lastSeenWrites.set(p.sid, now);
    void sql('update sessions set last_seen_at = now() where id = $1', [p.sid]).catch(() => {});
  }
  return { id: p.sub, email: p.email, sessionId: p.sid };
}

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const token = bearer(req);
  if (!token) throw unauthorized();
  req.user = await resolveUser(token);
}
