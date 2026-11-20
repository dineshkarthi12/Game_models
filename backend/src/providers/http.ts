import { ProviderError } from './types.js';

/** JSON fetch with timeout, typed errors and retry hints for 429/5xx. */
export async function providerFetch<T>(provider: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new ProviderError(provider, `Could not reach ${provider} API: ${(e as Error).message}`, undefined, true);
  } finally { clearTimeout(t); }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body as { message?: string; msg?: string })?.message ?? (body as { message?: string; msg?: string })?.msg ?? (typeof body === 'string' ? body.slice(0, 300) : res.statusText);
    const hint = res.status === 401 || res.status === 403 ? ' (check the API key)' : res.status === 402 ? ' (provider account has insufficient balance)' : '';
    throw new ProviderError(provider, `${provider} API ${res.status}: ${msg}${hint}`, res.status, res.status === 429 || res.status >= 500);
  }
  return body as T;
}

export async function downloadTo(provider: string, url: string, dest: string) {
  const fs = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const { Readable } = await import('node:stream');
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new ProviderError(provider, `Download failed (${res.status})`, res.status, res.status >= 500);
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest));
}
