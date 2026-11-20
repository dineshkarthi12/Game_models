import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { providerFetch } from './http.js';
import { POLYCOUNT, rankImages, type AIProvider, type GenerationSettings, type InputImage, type TaskState } from './types.js';

/**
 * Tripo adapter (OpenAPI v2): image_to_model (1 image) and multiview_to_model (front required,
 * then left, back, right — fixed order). Images are uploaded first to obtain file tokens.
 * Field names follow Tripo's public API as known at build time; see docs/AI_PROVIDERS.md.
 */
const STATUS: Record<string, TaskState['status']> = { queued: 'queued', running: 'running', success: 'succeeded', failed: 'failed', cancelled: 'cancelled', banned: 'failed', expired: 'failed', unknown: 'failed' };
const MV_ORDER = ['front', 'left', 'back', 'right'] as const;
const auth = () => ({ Authorization: `Bearer ${config.TRIPO_API_KEY}` });
const ext = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg');

async function upload(img: InputImage): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(img.path)], { type: img.mime }), path.basename(img.path));
  const r = await providerFetch<{ code: number; data: { image_token?: string; file_token?: string }; message?: string }>('tripo', `${config.TRIPO_API_BASE}/upload`, {
    method: 'POST', headers: auth(), body: form, timeoutMs: 120_000,
  });
  const token = r.data?.image_token ?? r.data?.file_token;
  if (r.code !== 0 || !token) throw new Error(`Tripo upload failed: ${r.message ?? 'no token returned'}`);
  return token;
}

export const tripo: AIProvider = {
  id: 'tripo', name: 'Tripo', isDemo: false,
  configured: () => !!config.TRIPO_API_KEY,
  capabilities: {
    modes: ['single_image', 'multi_image'], max_images: 4, multiview_angles: [...MV_ORDER],
    quality_levels: ['draft', 'standard', 'high', 'ultra'], texture_resolutions: ['none', '2k', '4k'],
    supports_pbr: true, supports_polycount: true, polycount_range: [1_000, 500_000], supports_topology: true, supports_remesh: false,
    supports_rigging: true, supports_symmetry: false, supports_texture_prompt: false, output_formats: ['glb'],
    notes: [
      'Multiview mode uses exactly the Front, Left, Back and Right views (Front is required). Other angles are not sent.',
      '"4K" maps to Tripo texture_quality "detailed"; "2K" to "standard".',
      'Rigging uses Tripo animate_rig for supported humanoid / quadruped models.',
    ],
  },
  selectInputs(images) {
    const byAngle = (a: string) => rankImages(images.filter((i) => i.angle === a), [a])[0];
    const mv = MV_ORDER.map(byAngle);
    if (mv[0] && mv.filter(Boolean).length >= 2) {
      const selected = mv.filter(Boolean) as InputImage[];
      return { selected, reason: `Tripo multiview uses Front/Left/Back/Right; ${selected.length} of those views were sent. Other angles are not supported by this endpoint.` };
    }
    const best = rankImages(images, ['front', 'front_right', 'front_left', 'right', 'left'])[0]!;
    return { selected: [best], reason: mv[0] ? 'Only one canonical side view besides Front is missing — single-image mode with the Front view.' : 'No Front view assigned, so Tripo multiview cannot be used; the best single image was sent (image_to_model).' };
  },
  async createTask(images, s: GenerationSettings) {
    const tokens = await Promise.all(images.map(async (i) => ({ angle: i.angle, file: { type: ext(i.mime), file_token: await upload(i) } })));
    const common: Record<string, unknown> = {
      model_version: s.quality === 'draft' ? 'v2.0-20240919' : 'v2.5-20250123',
      texture: s.texture_resolution !== 'none',
      pbr: s.texture_resolution !== 'none' && s.pbr,
      texture_quality: s.texture_resolution === '4k' || s.quality === 'ultra' ? 'detailed' : 'standard',
      face_limit: s.polygon_level === 'custom' ? s.target_polycount : POLYCOUNT[s.polygon_level],
      quad: s.topology === 'quad',
    };
    let body: Record<string, unknown>;
    if (images.length > 1) {
      const files = MV_ORDER.map((a) => tokens.find((t) => t.angle === a)?.file ?? {});
      body = { type: 'multiview_to_model', files, ...common };
    } else body = { type: 'image_to_model', file: tokens[0]!.file, ...common };
    const r = await providerFetch<{ code: number; data: { task_id: string }; message?: string }>('tripo', `${config.TRIPO_API_BASE}/task`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.code !== 0) throw new Error(`Tripo task creation failed: ${r.message ?? r.code}`);
    return { taskId: r.data.task_id, request: body, endpoint: 'task' };
  },
  async getTask(taskId) {
    const r = await providerFetch<{ code: number; data: { status: string; progress?: number; output?: Record<string, string>; error?: string } }>(
      'tripo', `${config.TRIPO_API_BASE}/task/${encodeURIComponent(taskId)}`, { headers: auth() });
    const d = r.data; const status = STATUS[d.status] ?? 'running';
    const o = d.output ?? {};
    return {
      status, progress: typeof d.progress === 'number' ? d.progress : null,
      error: status === 'failed' ? d.error || `Tripo task ${d.status}` : undefined,
      outputs: { glb: o.pbr_model ?? o.model ?? o.base_model, thumbnail: o.rendered_image },
      raw: { status: d.status, progress: d.progress },
    };
  },
  async createRigTask(sourceTaskId) {
    const body = { type: 'animate_rig', original_model_task_id: sourceTaskId, out_format: 'glb' };
    const r = await providerFetch<{ code: number; data: { task_id: string } }>('tripo', `${config.TRIPO_API_BASE}/task`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { taskId: r.data.task_id, request: body, endpoint: 'task' };
  },
};
