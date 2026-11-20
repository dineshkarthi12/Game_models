import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import { storage, verifyLocal, mimeFor } from '../storage/index.js';
import { AppError } from '../utils/errors.js';

/** Serves files for the local storage driver via HMAC-signed, expiring tokens (S3 uses presigned URLs instead). */
export async function fileRoutes(app: FastifyInstance) {
  app.get('/files/:token', { config: { rateLimit: false } }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const data = verifyLocal(token);
    if (!data) throw new AppError(403, 'invalid_signature', 'This link is invalid or has expired');
    if (storage.name !== 'local') throw new AppError(404, 'not_found', 'Not found');
    const p = (storage as unknown as { path(k: string): string }).path(data.k);
    let stat: fs.Stats;
    try { stat = await fs.promises.stat(p); } catch { throw new AppError(404, 'not_found', 'File not found'); }
    reply.header('Content-Type', mimeFor(data.k));
    reply.header('Cache-Control', 'private, max-age=300');
    reply.header('Accept-Ranges', 'bytes');
    if (data.d) reply.header('Content-Disposition', `attachment; filename="${data.d.replace(/"/g, '')}"`);
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) return reply.code(416).header('Content-Range', `bytes */${stat.size}`).send();
      reply.code(206).header('Content-Range', `bytes ${start}-${end}/${stat.size}`).header('Content-Length', end - start + 1);
      return reply.send(fs.createReadStream(p, { start, end }));
    }
    reply.header('Content-Length', stat.size);
    return reply.send(fs.createReadStream(p));
  });
}
