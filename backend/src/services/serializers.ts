import { storage } from '../storage/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const url = async (key: string | null | undefined, ttl = 3600) => (key ? storage.signedUrl(key, { expiresIn: ttl }) : null);

export async function serializeProject(r: Row) {
  return {
    id: r.id, name: r.name, description: r.description, category: r.category, status: r.status, team_id: r.team_id, owner_id: r.owner_id,
    image_count: r.image_count ?? 0, model_count: r.model_count ?? 0, generation_count: r.generation_count ?? 0,
    cover_url: await url(r.cover_key), created_at: r.created_at, updated_at: r.updated_at,
  };
}

export async function serializeImage(r: Row) {
  return {
    id: r.id, project_id: r.project_id, angle: r.angle, custom_label: r.custom_label, original_name: r.original_name, mime_type: r.mime_type,
    size_bytes: r.size_bytes, width: r.width, height: r.height, sha256: r.sha256, sort_order: r.sort_order, quality: r.quality,
    url: await url(r.storage_key), thumb_url: await url(r.thumb_key), created_at: r.created_at,
  };
}

export async function serializeModel(r: Row) {
  return {
    id: r.id, project_id: r.project_id, project_name: r.project_name, generation_id: r.generation_id, name: r.name, category: r.category,
    source: r.source, provider: r.provider, is_demo: r.is_demo, status: r.status, current_version_id: r.current_version_id,
    current_version: r.current_version ?? null, favorite: r.favorite, tags: r.tags ?? [], folder_id: r.folder_id, game_ready: r.game_ready,
    thumbnail_url: await url(r.thumbnail_key), stats: r.stats ?? null, created_at: r.created_at, updated_at: r.updated_at,
  };
}

export async function serializeVersion(r: Row) {
  return {
    id: r.id, model_id: r.model_id, version: r.version, label: r.label, operation: r.operation, parent_version_id: r.parent_version_id,
    params: r.params, file_url: await url(r.storage_key, 6 * 3600), file_size: r.file_size, stats: r.stats ?? null, is_lod: r.is_lod,
    lod_level: r.lod_level, created_at: r.created_at,
  };
}

export function serializeGeneration(r: Row) {
  return {
    id: r.id, project_id: r.project_id, project_name: r.project_name, mode: r.mode, provider: r.provider, status: r.status, stage: r.stage,
    progress: r.progress, progress_source: r.progress_source, settings: r.settings, input_image_ids: r.input_image_ids, used_image_ids: r.used_image_ids,
    error: r.error, model_id: r.model_id, credits_charged: r.credits_charged, is_demo: r.is_demo, provider_task_id: r.provider_task_id ?? null,
    events: r.events ?? [], metrics: r.metrics ?? {}, created_at: r.created_at, started_at: r.started_at, completed_at: r.completed_at,
  };
}
