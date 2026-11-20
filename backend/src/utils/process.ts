import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { storage, localRoot } from '../storage/index.js';

export interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; killed: boolean }

/**
 * Run a native process. Lines on stdout can be streamed to onLine (used for JSON progress events).
 * Never uses a shell; arguments are passed as an array.
 */
export function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; onLine?: (l: string) => void; signal?: AbortSignal; env?: Record<string, string>; processGroup?: boolean } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'], detached: !!opts.processGroup });
    let stdout = ''; let stderr = ''; let buf = ''; let timedOut = false; let killed = false;
    // With processGroup, the whole tree (e.g. python -> colmap) is terminated, not just the parent.
    const sig = (s: NodeJS.Signals) => { try { if (opts.processGroup && child.pid) process.kill(-child.pid, s); else child.kill(s); } catch { /* already exited */ } };
    const kill = () => { killed = true; sig('SIGTERM'); setTimeout(() => sig('SIGKILL'), 5000).unref(); };
    const t = opts.timeoutMs ? setTimeout(() => { timedOut = true; kill(); }, opts.timeoutMs) : null;
    opts.signal?.addEventListener('abort', kill);
    const onOut = (d: Buffer): void => {
      const s = d.toString(); stdout += s; if (stdout.length > 20_000_000) stdout = stdout.slice(-10_000_000);
      if (!opts.onLine) return;
      buf += s;
      let i = buf.indexOf('\n');
      while (i >= 0) { opts.onLine(buf.slice(0, i)); buf = buf.slice(i + 1); i = buf.indexOf('\n'); }
    };
    const onErr = (d: Buffer): void => { stderr += d.toString(); if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000); };
    (child.stdout as unknown as NodeJS.EventEmitter).on('data', onOut);
    (child.stderr as unknown as NodeJS.EventEmitter).on('data', onErr);
    child.on('error', (e) => { stderr += String(e); });
    child.on('close', (code) => { if (t) clearTimeout(t); if (buf && opts.onLine) opts.onLine(buf); resolve({ code, stdout, stderr, timedOut, killed }); });
  });
}

export async function makeWorkDir(prefix: string) {
  const dir = path.join(config.WORK_DIR, `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Return a local filesystem path for a storage key (direct path for local driver, downloaded copy for S3). */
export async function materialize(key: string, workDir: string): Promise<string> {
  if (storage.name === 'local') return path.join(localRoot, key);
  const p = path.join(workDir, 'inputs', key.replace(/\//g, '_'));
  await storage.download(key, p);
  return p;
}

export const workerScript = (...p: string[]) => path.join(config.WORKERS_DIR, ...p);
