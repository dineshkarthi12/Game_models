import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const bool = z.union([z.boolean(), z.string()]).transform((v) => v === true || v === 'true' || v === '1');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_APP_URL: z.string().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/vistora'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  APP_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  AUTH_MODE: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_JWT_SECRET: z.string().optional().default(''),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage-data'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  MESHY_API_KEY: z.string().optional().default(''),
  MESHY_API_BASE: z.string().default('https://api.meshy.ai'),
  TRIPO_API_KEY: z.string().optional().default(''),
  TRIPO_API_BASE: z.string().default('https://api.tripo3d.ai/v2/openapi'),
  PROVIDER_WEBHOOK_SECRET: z.string().optional().default(''),
  DEMO_MODE: bool.default(false),
  COLMAP_BIN: z.string().default('colmap'),
  BLENDER_BIN: z.string().default('blender'),
  PYTHON_BIN: z.string().default('../workers/.venv/bin/python'),
  WORKERS_DIR: z.string().default('../workers'),
  WORK_DIR: z.string().default('./.tmp/work'),
  WORKER_CONCURRENCY_PHOTOGRAMMETRY: z.coerce.number().default(1),
  WORKER_CONCURRENCY_PROCESSING: z.coerce.number().default(2),
  MAX_UPLOAD_MB: z.coerce.number().default(40),
  MAX_IMAGES_PER_PROJECT: z.coerce.number().default(200),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(300),
  PROVIDER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  PROVIDER_TIMEOUT_MS: z.coerce.number().default(30 * 60 * 1000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;
if (env.NODE_ENV === 'production' && env.APP_SECRET === 'dev-only-secret-change-me-please') {
  console.error('APP_SECRET must be set in production');
  process.exit(1);
}

const abs = (p: string) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));
export const config = {
  ...env,
  STORAGE_LOCAL_DIR: abs(env.STORAGE_LOCAL_DIR),
  PYTHON_BIN: env.PYTHON_BIN.includes('/') ? abs(env.PYTHON_BIN) : env.PYTHON_BIN,
  WORKERS_DIR: abs(env.WORKERS_DIR),
  WORK_DIR: abs(env.WORK_DIR),
  isTest: env.NODE_ENV === 'test',
  isProd: env.NODE_ENV === 'production',
};
export type Config = typeof config;
