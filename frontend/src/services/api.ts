import { useAuthStore } from '@/stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

async function parse(res: Response) {
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return { message: text }; } })() : null;
  if (!res.ok) {
    if (res.status === 401) useAuthStore.getState().handleUnauthorized();
    throw new ApiError(res.status, body?.error ?? 'request_failed', body?.message ?? `Request failed (${res.status})`, body?.details);
  }
  return body;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await useAuthStore.getState().getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(init.json); }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  return parse(res) as Promise<T>;
}

export const http = {
  get: <T>(p: string) => api<T>(p),
  post: <T>(p: string, json?: unknown) => api<T>(p, { method: 'POST', json: json ?? {} }),
  put: <T>(p: string, json?: unknown) => api<T>(p, { method: 'PUT', json: json ?? {} }),
  patch: <T>(p: string, json?: unknown) => api<T>(p, { method: 'PATCH', json: json ?? {} }),
  del: <T>(p: string) => api<T>(p, { method: 'DELETE' }),
};

/** Multipart upload with real byte-level progress (XHR exposes upload progress; fetch does not). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    void useAuthStore.getState().getAccessToken().then((token) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}${path}`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100); };
      xhr.onload = () => {
        let body: { error?: string; message?: string } | null = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
        else reject(new ApiError(xhr.status, body?.error ?? 'upload_failed', body?.message ?? `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error during upload'));
      xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled'));
      signal?.addEventListener('abort', () => xhr.abort());
      xhr.send(form);
    });
  });
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
