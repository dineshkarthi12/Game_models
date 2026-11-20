import { pino } from 'pino';
import { config } from '../config.js';
export const logger = pino({
  level: config.isTest ? 'warn' : process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['req.headers.authorization', '*.password', '*.token', '*.apiKey'], remove: true },
});
