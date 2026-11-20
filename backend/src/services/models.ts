import { sql, sqlOne, transaction } from '../database/pool.js';
import { storage, keys } from '../storage/index.js';
import type { UserDb } from '../database/pool.js';

export const MODEL_SELECT = `
  select m.*, p.name as project_name, v.version as current_version, md.stats,
    coalesce((select array_agg(t.tag order by t.tag) from asset_tags t where t.model_id = m.id), '{}') as tags
  from models m join projects p on p.id = m.project_id
  left join model_versions v on v.id = m.current_version_id
  left join model_metadata md on md.version_id = m.current_version_id`;

export const VERSION_SELECT = `select v.*, md.stats from model_versions v left join model_metadata md on md.version_id = v.id`;

export async function getModelForUser(db: UserDb, id: string) {
  return db.one(`${MODEL_SELECT} where m.id = $1`, [id]);
}

/**
 * Create a new version row from a local file (system context; ownership is explicit).
 */
export async function createVersionFromFile(opts: {
  ownerId: string; modelId: string; filePath: string; label: string; operation: string; parentVersionId?: string | null;
  params?: Record<string, unknown>; isLod?: boolean; lodLevel?: number | null; setCurrent?: boolean;
}) {
  return transaction(async (c) => {
    await c.query('select pg_advisory_xact_lock(hashtext($1))', [`model-version:${opts.modelId}`]);
    const next = await c.query<{ n: number }>('select coalesce(max(version),0)+1 as n from model_versions where model_id = $1', [opts.modelId]);
    const version = next.rows[0]!.n;
    const key = keys.modelFile(opts.ownerId, opts.modelId, version);
    const size = await storage.putFile(key, opts.filePath, 'model/gltf-binary');
    const v = await c.query<{ id: string }>(
      `insert into model_versions (model_id, owner_id, version, label, operation, parent_version_id, params, storage_key, file_size, is_lod, lod_level)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [opts.modelId, opts.ownerId, version, opts.label, opts.operation, opts.parentVersionId ?? null, JSON.stringify(opts.params ?? {}), key, size, opts.isLod ?? false, opts.lodLevel ?? null]);
    const id = v.rows[0]!.id;
    if (opts.setCurrent !== false) await c.query('update models set current_version_id = $1 where id = $2', [id, opts.modelId]);
    return { id, version, key, size };
  });
}

/** Duplicates a model including all version files (copied, so deleting one never breaks the other). */
export async function duplicateModel(ownerId: string, modelId: string, newName: string) {
  const m = await sqlOne('select * from models where id = $1 and owner_id = $2', [modelId, ownerId]);
  if (!m) return null;
  const versions = await sql('select * from model_versions where model_id = $1 order by version', [modelId]);
  const nm = await sqlOne<{ id: string }>(
    `insert into models (owner_id, project_id, generation_id, name, category, source, provider, is_demo, status, folder_id, game_ready)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [ownerId, m.project_id, m.generation_id, newName, m.category, m.source, m.provider, m.is_demo, m.status, m.folder_id, m.game_ready]);
  const idMap = new Map<string, string>();
  for (const v of versions) {
    const key = keys.modelFile(ownerId, nm!.id, v.version);
    await storage.put(key, await streamToBuf(await storage.get(v.storage_key)), 'model/gltf-binary');
    const nv = await sqlOne<{ id: string }>(
      `insert into model_versions (model_id, owner_id, version, label, operation, parent_version_id, params, storage_key, file_size, is_lod, lod_level, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [nm!.id, ownerId, v.version, v.label, v.operation, v.parent_version_id ? idMap.get(v.parent_version_id) ?? null : null, v.params, key, v.file_size, v.is_lod, v.lod_level, v.created_at]);
    idMap.set(v.id, nv!.id);
    const meta = await sqlOne('select stats from model_metadata where version_id = $1', [v.id]);
    if (meta) await sql('insert into model_metadata (version_id, owner_id, stats) values ($1,$2,$3)', [nv!.id, ownerId, meta.stats]);
  }
  if (m.current_version_id) await sql('update models set current_version_id = $1 where id = $2', [idMap.get(m.current_version_id) ?? null, nm!.id]);
  if (m.thumbnail_key) {
    const tk = keys.modelThumb(ownerId, nm!.id);
    await storage.put(tk, await streamToBuf(await storage.get(m.thumbnail_key)), 'image/png');
    await sql('update models set thumbnail_key = $1 where id = $2', [tk, nm!.id]);
  }
  await sql(`insert into asset_tags (owner_id, model_id, tag) select owner_id, $1, tag from asset_tags where model_id = $2`, [nm!.id, modelId]);
  return nm!.id;
}

async function streamToBuf(s: NodeJS.ReadableStream) { const out: Buffer[] = []; for await (const c of s) out.push(Buffer.from(c as Buffer)); return Buffer.concat(out); }
