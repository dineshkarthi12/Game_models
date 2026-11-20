import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asUser, sql } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { storage } from '../storage/index.js';
import { serializeVersion, serializeModel } from '../services/serializers.js';
import { MODEL_SELECT, VERSION_SELECT } from '../services/models.js';
import { recalcStorage } from '../services/storageUsage.js';

export async function modelRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/models/:id/versions', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const rows = await asUser(req.user.id, async (db) => {
      if (!(await db.one('select 1 from models where id = $1', [id]))) throw notFound('Model');
      return db.all(`${VERSION_SELECT} where v.model_id = $1 order by v.version desc`, [id]);
    });
    return { items: await Promise.all(rows.map(serializeVersion)) };
  });

  /** Measured statistics + integrity of a version, plus reconstruction artefacts when the model came from photogrammetry. */
  app.get('/models/:id/metadata', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { version_id } = parse(z.object({ version_id: uuid.optional() }), req.query);
    return asUser(req.user.id, async (db) => {
      const m = await db.one(`${MODEL_SELECT} where m.id = $1`, [id]);
      if (!m) throw notFound('Model');
      const vid = version_id ?? m.current_version_id;
      const v = vid ? await db.one(`${VERSION_SELECT} where v.id = $1 and v.model_id = $2`, [vid, id]) : null;
      const textures = vid ? await db.all('select name, map_type, width, height, mime_type from model_textures where version_id = $1', [vid]) : [];
      const gen = m.generation_id ? await db.one(`select g.mode, g.provider, g.settings, g.metrics, g.used_image_ids, g.input_image_ids, g.created_at, g.completed_at,
          r.point_cloud_key, r.cameras_key, r.log_key from generations g left join reconstruction_jobs r on r.generation_id = g.id where g.id = $1`, [m.generation_id]) : null;
      const sign = (k: string | null | undefined) => (k ? storage.signedUrl(k, { expiresIn: 6 * 3600 }) : null);
      return {
        model: await serializeModel(m),
        version: v ? await serializeVersion(v) : null,
        stats: v?.stats ?? null,
        textures,
        source: gen ? {
          mode: gen.mode, provider: gen.provider, settings: gen.settings, metrics: gen.metrics, used_images: gen.used_image_ids?.length ?? 0,
          input_images: gen.input_image_ids?.length ?? 0, created_at: gen.created_at, completed_at: gen.completed_at,
          point_cloud_url: await sign(gen.point_cloud_key), cameras_url: await sign(gen.cameras_key), log_url: await sign(gen.log_key),
        } : null,
      };
    });
  });

  /** Restore: make an earlier version current (versions are immutable; nothing is deleted). */
  app.put('/models/:id/current-version', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { version_id } = parse(z.object({ version_id: uuid }), req.body);
    await asUser(req.user.id, async (db) => {
      const v = await db.one('select 1 from model_versions where id = $1 and model_id = $2', [version_id, id]);
      if (!v) throw notFound('Version');
      await db.all('update models set current_version_id = $1 where id = $2 and owner_id = $3', [version_id, id, req.user.id]);
    });
    return { ok: true };
  });

  app.delete('/models/:id/versions/:versionId', async (req) => {
    const { id, versionId } = parse(z.object({ id: uuid, versionId: uuid }), req.params);
    const v = await asUser(req.user.id, async (db) => {
      const m = await db.one('select current_version_id from models where id = $1 and owner_id = $2', [id, req.user.id]);
      if (!m) throw notFound('Model');
      if (m.current_version_id === versionId) throw badRequest('The current version cannot be deleted. Restore another version first.');
      return db.one('delete from model_versions where id = $1 and model_id = $2 returning storage_key', [versionId, id]);
    });
    if (!v) throw notFound('Version');
    await storage.delete(v.storage_key);
    await recalcStorage(req.user.id);
    return { ok: true };
  });

  void sql;
}
