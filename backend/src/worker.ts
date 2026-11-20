import { Worker, type Job } from 'bullmq';
import { config } from './config.js';
import { redis, QUEUE_NAMES, closeQueues } from './jobs/queues.js';
import { processAiGeneration } from './jobs/processors/ai.js';
import { processAnalyze } from './jobs/processors/analyze.js';
import { processReconstruction } from './reconstruction/processor.js';
import { processorRegistry } from './jobs/registry.js';
import { logger } from './utils/logger.js';
import { pool } from './database/pool.js';
import { migrate } from './database/migrate.js';

processorRegistry.ai['generate'] = (job: Job) => processAiGeneration(job.data, { attemptsMade: job.attemptsMade, maxAttempts: job.opts.attempts ?? 1 });
processorRegistry.processing['analyze'] = (job: Job) => processAnalyze(job.data);
processorRegistry.photogrammetry['reconstruct'] = (job: Job) => processReconstruction(job.data);

export function startWorkers() {
  const mk = (key: keyof typeof QUEUE_NAMES, concurrency: number) => {
    const w = new Worker(QUEUE_NAMES[key], async (job) => {
      const fn = processorRegistry[key][job.name];
      if (!fn) throw new Error(`No processor for ${key}:${job.name}`);
      return fn(job);
    }, { connection: redis(), concurrency, lockDuration: 120_000, stalledInterval: 60_000 });
    w.on('failed', (job, err) => logger.error({ queue: key, job: job?.name, id: job?.id, err: err.message }, 'job failed'));
    w.on('completed', (job) => logger.info({ queue: key, job: job.name, id: job.id }, 'job completed'));
    return w;
  };
  return [
    mk('ai', 10),
    mk('photogrammetry', config.WORKER_CONCURRENCY_PHOTOGRAMMETRY),
    mk('processing', config.WORKER_CONCURRENCY_PROCESSING),
    mk('export', config.WORKER_CONCURRENCY_PROCESSING),
  ];
}

const isMain = process.argv[1]?.endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js');
if (isMain) {
  await migrate((m) => logger.info(m));
  const workers = startWorkers();
  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'workers started');
  const shutdown = async () => {
    logger.info('shutting down workers (letting active jobs finish)');
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues(); await pool.end(); process.exit(0);
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
