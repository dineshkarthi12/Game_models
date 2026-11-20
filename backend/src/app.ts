import Fastify, { type FastifyError, type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { AppError } from './utils/errors.js';
import { authRoutes } from './routes/auth.js';
import { notificationRoutes } from './routes/notifications.js';
import { registerExtraRoutes } from './routes/index.js';

export async function buildApp() {
  const app = Fastify({ loggerInstance: logger as unknown as FastifyBaseLogger, trustProxy: true, maxParamLength: 2048, bodyLimit: 2 * 1024 * 1024, disableRequestLogging: config.isTest });
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, { origin: [config.PUBLIC_APP_URL, /localhost:\d+$/], credentials: true });
  await app.register(rateLimit, { max: config.RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 50, fields: 20 } });

  app.setErrorHandler((err: FastifyError | AppError | ZodError, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code, message: err.message, details: err.details });
    if (err instanceof ZodError) return reply.code(400).send({ error: 'bad_request', message: 'Invalid input', details: err.flatten() });
    const fe = err as FastifyError;
    if (fe.statusCode && fe.statusCode < 500) return reply.code(fe.statusCode).send({ error: fe.code ?? 'request_error', message: fe.message });
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error', message: 'An unexpected error occurred' });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'not_found', message: `Route ${req.method} ${req.url} not found` }));

  await app.register(async (api) => {
    api.get('/health', async () => ({ ok: true, time: new Date().toISOString() }));
    await api.register(authRoutes);
    await api.register(notificationRoutes);
    await registerExtraRoutes(api);
  }, { prefix: '/api' });

  return app;
}
