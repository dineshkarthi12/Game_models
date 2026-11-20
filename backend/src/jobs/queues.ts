import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

export const QUEUE_NAMES = { ai: 'ai-generation', photogrammetry: 'photogrammetry', processing: 'model-processing', export: 'export' } as const;
type QueueKey = keyof typeof QUEUE_NAMES;

let connection: Redis | null = null;
export function redis(): Redis {
  connection ??= new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
  return connection;
}

const defaults: Record<QueueKey, JobsOptions> = {
  ai: { attempts: 4, backoff: { type: 'exponential', delay: 15_000 } },
  photogrammetry: { attempts: 1 },
  processing: { attempts: 2, backoff: { type: 'fixed', delay: 5_000 } },
  export: { attempts: 2, backoff: { type: 'fixed', delay: 5_000 } },
};

const cache = new Map<QueueKey, Queue>();
export function queue(k: QueueKey): Queue {
  let q = cache.get(k);
  if (!q) {
    q = new Queue(QUEUE_NAMES[k], { connection: redis(), defaultJobOptions: { removeOnComplete: { count: 2000 }, removeOnFail: { count: 5000 }, ...defaults[k] } });
    cache.set(k, q);
  }
  return q;
}

export async function enqueue(k: QueueKey, name: string, data: Record<string, unknown>, opts: JobsOptions = {}) {
  return queue(k).add(name, data, opts);
}

export async function closeQueues() {
  await Promise.all([...cache.values()].map((q) => q.close()));
  cache.clear();
  if (connection) { await connection.quit().catch(() => {}); connection = null; }
}
