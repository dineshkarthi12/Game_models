import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './database/migrate.js';
import { logger } from './utils/logger.js';

const app = await buildApp();
await migrate((m) => logger.info(m));
await app.listen({ port: config.PORT, host: '0.0.0.0' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { void app.close().then(() => process.exit(0)); });
