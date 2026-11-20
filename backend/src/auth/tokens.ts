import { SignJWT, jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import crypto from 'node:crypto';
import { config } from '../config.js';

const localKey = new TextEncoder().encode(config.APP_SECRET);
const ISSUER = 'vistora-3d';

export async function signAccessToken(userId: string, sessionId: string, email: string): Promise<string> {
  return new SignJWT({ sid: sessionId, email })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuer(ISSUER).setIssuedAt().setExpirationTime('7d').sign(localKey);
}

export async function verifyLocalToken(token: string): Promise<{ sub: string; sid: string; email: string }> {
  const { payload } = await jwtVerify(token, localKey, { issuer: ISSUER, algorithms: ['HS256'] });
  return { sub: String(payload.sub), sid: String((payload as JWTPayload & { sid: string }).sid), email: String((payload as { email?: string }).email ?? '') };
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
/** Verifies Supabase access tokens: legacy HS256 shared secret, or asymmetric keys via the project JWKS. */
export async function verifySupabaseToken(token: string): Promise<{ sub: string; email: string }> {
  let payload: JWTPayload;
  if (config.SUPABASE_JWT_SECRET) {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(config.SUPABASE_JWT_SECRET), { audience: 'authenticated' }));
  } else {
    jwks ??= createRemoteJWKSet(new URL(`${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`));
    ({ payload } = await jwtVerify(token, jwks, { audience: 'authenticated' }));
  }
  return { sub: String(payload.sub), email: String((payload as { email?: string }).email ?? '') };
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
