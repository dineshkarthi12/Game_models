import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getApp, registerUser } from './helpers.js';
import { sql } from '../src/database/pool.js';
import { sha256 } from '../src/auth/tokens.js';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); });

describe('auth', () => {
  it('registers a user with welcome credits and free plan', async () => {
    const { user } = await registerUser(app, 'Ada');
    expect(user.plan).toBe('free');
    expect(user.credits).toBe(60);
    expect(user.full_name).toBe('Ada');
  });

  it('rejects duplicate email and weak passwords', async () => {
    const { email } = await registerUser(app);
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'Passw0rd!x' } });
    expect(dup.statusCode).toBe(409);
    const weak = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'x@example.com', password: 'short' } });
    expect(weak.statusCode).toBe(400);
  });

  it('logs in, reads /me, logs out and rejects the revoked token', async () => {
    const { email } = await registerUser(app);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'wrongpass1' } });
    expect(bad.statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: email.toUpperCase(), password: 'Passw0rd!x' } });
    expect(login.statusCode).toBe(200);
    const headers = { authorization: `Bearer ${login.json().token}` };
    expect((await app.inject({ url: '/api/auth/me', headers })).json().email).toBe(email);
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers })).statusCode).toBe(401);
  });

  it('requires auth for protected routes', async () => {
    expect((await app.inject({ url: '/api/auth/me' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/auth/me', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
  });

  it('resets password with a single-use token and revokes sessions', async () => {
    const { email, auth, user } = await registerUser(app);
    const r = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email } });
    expect(r.statusCode).toBe(200);
    // Same response for unknown accounts
    expect((await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'nobody@example.com' } })).json().ok).toBe(true);
    // Simulate the emailed token by inserting a known one (the real token is only logged/emailed).
    const token = 'known-reset-token-abcdefghijklmnopqrstuvwxyz';
    await sql(`insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1,$2, now() + interval '1 hour')`, [user.id, sha256(token)]);
    const reset = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token, password: 'NewPassw0rd' } });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: auth })).statusCode).toBe(401);
    const again = await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token, password: 'NewPassw0rd2' } });
    expect(again.statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'NewPassw0rd' } })).statusCode).toBe(200);
  });

  it('updates profile and lists/revokes sessions', async () => {
    const { auth } = await registerUser(app);
    const p = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: auth, payload: { company: 'Acme', preferences: { units: 'cm' } } });
    expect(p.json().company).toBe('Acme');
    expect(p.json().preferences.units).toBe('cm');
    const s = await app.inject({ url: '/api/auth/sessions', headers: auth });
    expect(s.json().items[0].current).toBe(true);
  });
});
