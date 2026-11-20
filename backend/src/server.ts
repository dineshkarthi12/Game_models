import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './database/migrate.js';
import { logger } from './utils/logger.js';

const app = await buildApp();
await migrate((m) => logger.info(m));
await app.listen({ port: config.PORT, host: '0.0.0.0' });

// Single-service hosting (e.g. Render free tier, no background workers): run the queue workers in this process.
let stopWorkers: (() => Promise<void>) | null = null;
if (config.RUN_WORKER_IN_API) {
  const { runWorkers } = await import('./worker.js');
  stopWorkers = await runWorkers();
  logger.warn('RUN_WORKER_IN_API=true: queue workers are running inside the API process');
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { void (async () => { await stopWorkers?.(); await app.close(); process.exit(0); })(); });
