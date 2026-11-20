import fs from 'node:fs/promises';
import { config } from '../config.js';
import { providerFetch } from './http.js';
import { POLYCOUNT, rankImages, type AIProvider, type GenerationSettings, type InputImage, type TaskState } from './types.js';

/**
 * Meshy adapter — Image to 3D (single image) and Multi-Image to 3D (1–4 images).
 * Field names follow Meshy's public OpenAPI (v1). They could not be re-verified against the live
 * documentation from the build environment — see docs/AI_PROVIDERS.md before production use.
 */
const STATUS: Record<string, TaskState['status']> = { PENDING: 'queued', IN_PROGRESS: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed', CANCELED: 'cancelled', EXPIRED: 'failed' };
const PRIORITY = ['front', 'front_right', 'front_left', 'right', 'left', 'back', 'back_right', 'back_left', 'top', 'bottom', 'custom'];

async function dataUri(img: InputImage) {
  return `data:${img.mime};base64,${(await fs.readFile(img.path)).toString('base64')}`;
}

export const meshy: AIProvider = {
  id: 'meshy', name: 'Meshy', isDemo: false,
  configured: () => !!config.MESHY_API_KEY,
  capabilities: {
    modes: ['single_image', 'multi_image'], max_images: 4,
    quality_levels: ['draft', 'standard', 'high', 'ultra'], texture_resolutions: ['none', '2k'],
    supports_pbr: true, supports_polycount: true, polycount_range: [100, 300_000], supports_topology: true, supports_remesh: true,
    supports_rigging: true, supports_symmetry: true, supports_texture_prompt: true, output_formats: ['glb', 'fbx', 'obj', 'usdz'],
    notes: [
      'Multi-Image to 3D accepts 1–4 images of the same object; additional uploads are not sent.',
      'Texture resolution is chosen by Meshy; the "none" option disables texturing.',
      'Rigging is available for humanoid characters (height in metres).',
    ],
  },
  selectInputs(images) {
    const ranked = rankImages(images, PRIORITY);
    const selected = ranked.slice(0, 4);
    return { selected, reason: images.length > 4 ? `Meshy Multi-Image to 3D accepts at most 4 images; the 4 best-ranked canonical views were sent.` : `${selected.length} image(s) sent.` };
  },
  async createTask(images, s: GenerationSettings) {
    const multi = images.length > 1;
    const body: Record<string, unknown> = {
      ai_model: s.quality === 'draft' ? 'meshy-4' : 'latest',
      topology: s.topology ?? 'triangle',
      target_polycount: s.polygon_level === 'custom' ? s.target_polycount : POLYCOUNT[s.polygon_level],
      should_remesh: s.remesh ?? true,
      should_texture: s.texture_resolution !== 'none',
      enable_pbr: s.texture_resolution !== 'none' && s.pbr,
      symmetry_mode: s.symmetry ?? 'auto',
    };
    if (s.texture_prompt) body.texture_prompt = s.texture_prompt.slice(0, 600);
    const endpoint = multi ? 'multi-image-to-3d' : 'image-to-3d';
    if (multi) body.image_urls = await Promise.all(images.map(dataUri)); else body.image_url = await dataUri(images[0]!);
    const r = await providerFetch<{ result: string }>('meshy', `${config.MESHY_API_BASE}/openapi/v1/${endpoint}`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.MESHY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeoutMs: 120_000,
    });
    const logged = { ...body, image_url: body.image_url ? '[data-uri omitted]' : undefined, image_urls: body.image_urls ? `[${images.length} data-uris omitted]` : undefined };
    return { taskId: r.result, request: logged, endpoint };
  },
  async getTask(taskId, endpoint) {
    const t = await providerFetch<{ status: string; progress?: number; model_urls?: Record<string, string>; thumbnail_url?: string; task_error?: { message?: string };
      rigged_character_glb_url?: string; result?: { rigged_character_glb_url?: string; rigged_character_fbx_url?: string } }>(
      'meshy', `${config.MESHY_API_BASE}/openapi/v1/${endpoint}/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${config.MESHY_API_KEY}` } });
    const status = STATUS[t.status] ?? 'running';
    const rigGlb = t.result?.rigged_character_glb_url ?? t.rigged_character_glb_url;
    return {
      status, progress: typeof t.progress === 'number' ? t.progress : null,
      error: status === 'failed' ? t.task_error?.message || 'Meshy reported the task as failed' : undefined,
      outputs: rigGlb ? { glb: rigGlb, fbx: t.result?.rigged_character_fbx_url } : { ...(t.model_urls ?? {}), thumbnail: t.thumbnail_url },
      raw: { status: t.status, progress: t.progress },
    };
  },
  async cancelTask(taskId, endpoint) {
    // Meshy exposes DELETE for tasks; a running task is removed rather than paused.
    await providerFetch('meshy', `${config.MESHY_API_BASE}/openapi/v1/${endpoint}/${encodeURIComponent(taskId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${config.MESHY_API_KEY}` } }).catch(() => {});
  },
  async createRigTask(sourceTaskId) {
    const body = { input_task_id: sourceTaskId, height_meters: 1.7 };
    const r = await providerFetch<{ result: string }>('meshy', `${config.MESHY_API_BASE}/openapi/v1/rigging`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.MESHY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { taskId: r.result, request: body, endpoint: 'rigging' };
  },
};
