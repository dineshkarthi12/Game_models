import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

export interface StorageDriver {
  name: string;
  put(key: string, body: Buffer | Readable, contentType?: string): Promise<number>;
  putFile(key: string, filePath: string, contentType?: string): Promise<number>;
  get(key: string): Promise<Readable>;
  download(key: string, filePath: string): Promise<void>;
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  signedUrl(key: string, opts?: { expiresIn?: number; downloadName?: string }): Promise<string>;
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.obj': 'text/plain', '.fbx': 'application/octet-stream', '.usd': 'application/octet-stream', '.usdc': 'application/octet-stream', '.usda': 'text/plain',
  '.usdz': 'model/vnd.usdz+zip', '.stl': 'model/stl', '.zip': 'application/zip', '.json': 'application/json', '.txt': 'text/plain', '.log': 'text/plain', '.ply': 'application/octet-stream',
};
export const mimeFor = (key: string) => MIME[path.extname(key).toLowerCase()] ?? 'application/octet-stream';

function safeKey(key: string) {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

// ───────────────────── local disk with HMAC-signed URLs ─────────────────────
export function signLocal(key: string, expiresAt: number, downloadName?: string) {
  const payload = Buffer.from(JSON.stringify({ k: key, e: expiresAt, d: downloadName ?? null })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.APP_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyLocal(token: string): { k: string; e: number; d: string | null } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', config.APP_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (typeof data.e !== 'number' || data.e < Date.now()) return null;
  return data;
}

class LocalStorage implements StorageDriver {
  name = 'local';
  constructor(private root: string) {}
  path(key: string) { return path.join(this.root, safeKey(key)); }
  async put(key: string, body: Buffer | Readable) {
    const p = this.path(key); await fsp.mkdir(path.dirname(p), { recursive: true });
    if (Buffer.isBuffer(body)) await fsp.writeFile(p, body); else await pipeline(body, fs.createWriteStream(p));
    return (await fsp.stat(p)).size;
  }
  async putFile(key: string, filePath: string) {
    const p = this.path(key); await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.copyFile(filePath, p);
    return (await fsp.stat(p)).size;
  }
  async get(key: string) { return fs.createReadStream(this.path(key)); }
  async download(key: string, filePath: string) { await fsp.mkdir(path.dirname(filePath), { recursive: true }); await fsp.copyFile(this.path(key), filePath); }
  async size(key: string) { try { return (await fsp.stat(this.path(key))).size; } catch { return null; } }
  async delete(key: string) { await fsp.rm(this.path(key), { force: true }); }
  async deletePrefix(prefix: string) { await fsp.rm(this.path(prefix.replace(/\/$/, '')), { recursive: true, force: true }); }
  async signedUrl(key: string, opts: { expiresIn?: number; downloadName?: string } = {}) {
    const exp = Date.now() + (opts.expiresIn ?? 3600) * 1000;
    // Round expiry to 5 minutes so URLs are stable across polls (browser cache friendly).
    const rounded = Math.ceil(exp / 300_000) * 300_000;
    return `/api/files/${signLocal(safeKey(key), rounded, opts.downloadName)}`;
  }
}

// ───────────────────── S3-compatible (Cloudflare R2 / Supabase Storage S3 / AWS) ─────────────────────
class S3Storage implements StorageDriver {
  name = 's3';
  client = new S3Client({
    region: config.S3_REGION, endpoint: config.S3_ENDPOINT || undefined, forcePathStyle: !!config.S3_ENDPOINT,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
  });
  constructor(private bucket: string) {}
  async put(key: string, body: Buffer | Readable, contentType?: string) {
    const buf = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: buf, ContentType: contentType ?? mimeFor(key) }));
    return buf.length;
  }
  async putFile(key: string, filePath: string, contentType?: string) {
    const size = (await fsp.stat(filePath)).size;
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: fs.createReadStream(filePath), ContentLength: size, ContentType: contentType ?? mimeFor(key) }));
    return size;
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    return r.Body as Readable;
  }
  async download(key: string, filePath: string) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await pipeline(await this.get(key), fs.createWriteStream(filePath));
  }
  async size(key: string) {
    try { return (await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }))).ContentLength ?? null; } catch { return null; }
  }
  async delete(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) })); }
  async deletePrefix(prefix: string) {
    let token: string | undefined;
    do {
      const list = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }));
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }
  async signedUrl(key: string, opts: { expiresIn?: number; downloadName?: string } = {}) {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket, Key: safeKey(key),
      ResponseContentDisposition: opts.downloadName ? `attachment; filename="${opts.downloadName.replace(/"/g, '')}"` : undefined,
    }), { expiresIn: opts.expiresIn ?? 3600 });
  }
}

async function streamToBuffer(s: Readable) { const chunks: Buffer[] = []; for await (const c of s) chunks.push(Buffer.from(c)); return Buffer.concat(chunks); }

export const storage: StorageDriver = config.STORAGE_DRIVER === 's3' ? new S3Storage(config.S3_BUCKET) : new LocalStorage(config.STORAGE_LOCAL_DIR);
export const localRoot = config.STORAGE_LOCAL_DIR;

export const keys = {
  image: (uid: string, pid: string, id: string, ext: string) => `users/${uid}/projects/${pid}/images/${id}${ext}`,
  thumb: (uid: string, pid: string, id: string) => `users/${uid}/projects/${pid}/thumbs/${id}.webp`,
  modelFile: (uid: string, mid: string, version: number, name = 'model.glb') => `users/${uid}/models/${mid}/v${version}/${name}`,
  modelThumb: (uid: string, mid: string) => `users/${uid}/models/${mid}/thumbnail.png`,
  reconstructionLog: (uid: string, gid: string) => `users/${uid}/reconstruction/${gid}/pipeline.log`,
  exportPkg: (uid: string, eid: string, name: string) => `users/${uid}/exports/${eid}/${name}`,
};
