import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { asUser, sql, sqlOne } from '../database/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, uuid } from '../utils/validate.js';
import { AppError, badRequest, forbidden, notFound } from '../utils/errors.js';
import { getProvider, providerInfo } from '../providers/index.js';
import { charge } from '../services/credits.js';
import { PLANS, generationCost, type Plan } from '../services/plans.js';
import { serializeGeneration } from '../services/serializers.js';
import { cancelGeneration, addEvent, refreshProjectStatus } from '../services/generations.js';
import { enqueue } from '../jobs/queues.js';
import { CATEGORIES } from './projects.js';
import { run } from '../utils/process.js';

export const settingsSchema = z.object({
  category: z.enum(CATEGORIES).default('custom'),
  quality: z.enum(['draft', 'standard', 'high', 'ultra']).default('standard'),
  polygon_level: z.enum(['low', 'medium', 'high', 'custom']).default('medium'),
  target_polycount: z.number().int().min(100).max(500_000).optional(),
  texture_resolution: z.enum(['none', '1k', '2k', '4k', '8k']).default('2k'),
  pbr: z.boolean().default(false),
  topology: z.enum(['triangle', 'quad']).default('triangle'),
  remesh: z.boolean().default(true),
  rig: z.boolean().default(false),
  symmetry: z.enum(['off', 'auto', 'on']).default('auto'),
  texture_prompt: z.string().trim().max(600).optional(),
  known_dimension: z.object({ axis: z.enum(['x', 'y', 'z', 'longest']), value: z.number().positive().max(100_000), unit: z.enum(['mm', 'cm', 'm', 'in']) }).optional(),
  matcher: z.enum(['exhaustive', 'sequential']).default('exhaustive'),
  max_image_size: z.number().int().min(640).max(6000).default(1600),
  parent_generation_id: uuid.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

const GEN_SELECT = `select g.*, p.name as project_name, j.provider_task_id from generations g join projects p on p.id = g.project_id
  left join lateral (select provider_task_id from generation_jobs where generation_id = g.id order by created_at desc limit 1) j on true`;

/** Validates settings against provider capabilities and plan, charges credits and enqueues — shared by AI and photogrammetry. */
export async function startGeneration(userId: string, input: { project_id: string; mode: 'ai' | 'photogrammetry'; provider: string; image_ids?: string[]; settings: Settings }) {
  const { project_id, mode } = input; const s = input.settings;
  const plan = (await sqlOne<{ plan: Plan }>('select plan from profiles where user_id = $1', [userId]))?.plan ?? 'free';
  if (!PLANS[plan].qualities.includes(s.quality)) throw forbidden(`${s.quality} quality requires a higher plan (current: ${PLANS[plan].name}).`);
  if (s.polygon_level === 'custom' && !s.target_polycount) throw badRequest('target_polycount is required when polygon_level is custom');

  let isDemo = false;
  if (mode === 'ai') {
    const p = getProvider(input.provider);
    if (!p) throw badRequest(`Unknown provider ${input.provider}`);
    if (!p.configured()) throw new AppError(503, 'configuration_required', `${p.name} is not configured on this server. An administrator must set its API key.`);
    const c = p.capabilities;
    if (!c.texture_resolutions.includes(s.texture_resolution)) throw badRequest(`${p.name} does not support texture resolution ${s.texture_resolution}`);
    if (s.pbr && !c.supports_pbr) throw badRequest(`${p.name} does not support PBR maps`);
    if (s.rig && !c.supports_rigging) throw badRequest(`${p.name} does not support rigging`);
    if (s.rig && !['human', 'creature', 'animal'].includes(s.category)) throw badRequest('Rigging is only offered for character, creature and animal assets');
    if (s.topology === 'quad' && !c.supports_topology) throw badRequest(`${p.name} does not support quad topology`);
    if (s.texture_prompt && !c.supports_texture_prompt) throw badRequest(`${p.name} does not support texture prompts`);
    if (s.polygon_level === 'custom' && c.polycount_range && (s.target_polycount! < c.polycount_range[0] || s.target_polycount! > c.polycount_range[1])) throw badRequest(`Target polycount must be within ${c.polycount_range.join('–')} for ${p.name}`);
    isDemo = p.isDemo;
  } else if (input.provider !== 'colmap') throw badRequest('Photogrammetry uses the colmap engine');

  return asUser(userId, async (db) => {
    const project = await db.one('select id from projects where id = $1', [project_id]);
    if (!project) throw notFound('Project');
    const imgs = await db.all<{ id: string }>(
      `select id from project_images where project_id = $1 ${input.image_ids?.length ? 'and id = any($2::uuid[])' : ''} order by sort_order`,
      input.image_ids?.length ? [project_id, input.image_ids] : [project_id]);
    if (!isDemo && imgs.length === 0) throw badRequest('Upload at least one reference image first');
    if (mode === 'photogrammetry' && imgs.length < 3) throw badRequest('Photogrammetry needs at least 3 overlapping images (20+ recommended)');
    const cost = generationCost(mode, s.quality, { demo: isDemo, rig: s.rig, pbr: s.pbr });
    const id = crypto.randomUUID();
    await db.all(`insert into generations (id, owner_id, project_id, mode, provider, settings, input_image_ids, credits_charged, is_demo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, userId, project_id, mode, input.provider, JSON.stringify(s), imgs.map((i) => i.id), cost, isDemo]);
    // Charge in the SAME transaction as the generation row. The ledger is not writable by vistora_app,
    // so the role is reset for this statement only and restored afterwards (RLS still applied above).
    await db.client.query('reset role');
    await charge(userId, cost, `${mode === 'ai' ? 'AI generation' : 'Photogrammetry'} (${s.quality})`, `gen:${id}:charge`, { type: 'generation', id }, db.client);
    await db.client.query('set local role vistora_app');
    return { id, cost };
  }).then(async ({ id, cost }) => {
    await addEvent(id, 'queued', `Queued (${cost} credits)${isDemo ? ' — DEMO provider: output will not be derived from your photos' : ''}`, isDemo ? 'warning' : 'info');
    if (mode === 'ai') await enqueue('ai', 'generate', { generationId: id }, { jobId: `gen-${id}` });
    else {
      await sql(`insert into reconstruction_jobs (generation_id, owner_id, status) values ($1,$2,'queued')`, [id, userId]);
      await enqueue('photogrammetry', 'reconstruct', { generationId: id }, { jobId: `recon-${id}` });
    }
    await refreshProjectStatus(project_id);
    return id;
  });
}

export async function getGeneration(userId: string, id: string) {
  const row = await asUser(userId, (db) => db.one(`${GEN_SELECT} where g.id = $1`, [id]));
  if (!row) throw notFound('Generation');
  return serializeGeneration(row);
}

let toolCache: { at: number; value: unknown } | null = null;
async function toolStatus() {
  if (toolCache && Date.now() - toolCache.at < 300_000) return toolCache.value;
  const colmap = await run(config.COLMAP_BIN, ['help'], { timeoutMs: 15_000 }).catch(() => null);
  const blender = await run(config.BLENDER_BIN, ['-v'], { timeoutMs: 30_000 }).catch(() => null);
  const py = await run(config.PYTHON_BIN, ['-c', 'import trimesh, cv2; print("ok")'], { timeoutMs: 30_000 }).catch(() => null);
  const ch = (colmap?.stdout ?? '') + (colmap?.stderr ?? '');
  const value = {
    colmap: { available: !!colmap && /COLMAP/.test(ch), version: ch.match(/COLMAP ([\d.]+)/)?.[1] ?? null, cuda: !!colmap && /with CUDA/.test(ch) },
    blender: { available: !!blender && blender.code === 0, version: blender?.stdout.match(/Blender ([\d.]+)/)?.[1] ?? null },
    python: { available: py?.stdout.includes('ok') ?? false },
  };
  toolCache = { at: Date.now(), value };
  return value;
}

export async function generationRoutes(app: FastifyInstance) {
  app.get('/providers', { preHandler: requireAuth }, async () => ({ items: providerInfo() }));
  app.get('/system/status', { preHandler: requireAuth }, async () => ({
    auth_mode: config.AUTH_MODE, storage_driver: config.STORAGE_DRIVER, demo_mode: config.DEMO_MODE, payments_enabled: false,
    tools: await toolStatus(), providers: providerInfo(),
  }));

  /** Dry run: which images would be sent, what it costs, and any blocking issues. No side effects. */
  app.post('/generations/preview', { preHandler: requireAuth }, async (req) => {
    const body = parse(z.object({ project_id: uuid, mode: z.enum(['ai', 'photogrammetry']), provider: z.string(), settings: settingsSchema }), req.body);
    const s = body.settings;
    const imgs = await asUser(req.user.id, (db) => db.all<{ id: string; angle: string; width: number; height: number; mime_type: string; quality: { is_blurry?: boolean } | null }>(
      'select id, angle, width, height, mime_type, quality from project_images where project_id = $1 order by sort_order', [body.project_id]));
    const plan = (await sqlOne<{ plan: Plan }>('select plan from profiles where user_id = $1', [req.user.id]))?.plan ?? 'free';
    const balance = Number((await sqlOne<{ b: number }>('select coalesce(sum(amount),0)::int as b from credit_transactions where user_id = $1', [req.user.id]))?.b ?? 0);
    const blocking: string[] = []; const warnings: string[] = [];
    let selected: string[] = []; let reason = ''; let isDemo = false;
    if (!PLANS[plan].qualities.includes(s.quality)) blocking.push(`${s.quality} quality requires a higher plan.`);
    if (body.mode === 'ai') {
      const p = getProvider(body.provider);
      if (!p) blocking.push('Unknown provider');
      else {
        isDemo = p.isDemo;
        if (!p.configured()) blocking.push(`${p.name} is not configured on this server (CONFIGURATION REQUIRED).`);
        const sel = p.selectInputs(imgs.map((i) => ({ id: i.id, path: '', mime: i.mime_type, angle: i.angle, width: i.width, height: i.height, quality: i.quality })));
        selected = sel.selected.map((x) => x.id); reason = sel.reason;
        if (!isDemo && !imgs.length) blocking.push('Upload at least one reference image.');
        if (isDemo) warnings.push('Demo output is procedural and is not reconstructed from your photos.');
      }
    } else {
      selected = imgs.map((i) => i.id); reason = `All ${imgs.length} images are used for feature matching.`;
      if (imgs.length < 3) blocking.push('Photogrammetry needs at least 3 overlapping images (20+ recommended).');
      else if (imgs.length < 20) warnings.push('Fewer than 20 images: registration may be incomplete.');
      const ov = (await asUser(req.user.id, (db) => db.one('select overlap_analysis from projects where id = $1', [body.project_id])))?.overlap_analysis;
      if (ov && !ov.suitable_for_photogrammetry) warnings.push(`Overlap check: ${ov.weakly_connected_image_ids.length} image(s) are weakly connected.`);
      if (!ov) warnings.push('Overlap has not been checked for this image set.');
    }
    const cost = generationCost(body.mode, s.quality, { demo: isDemo, rig: s.rig, pbr: s.pbr });
    if (cost > balance) blocking.push(`Needs ${cost} credits; balance is ${balance}.`);
    return { cost, balance, plan, selected_image_ids: selected, reason, warnings, blocking, image_count: imgs.length };
  });

  app.post('/generations', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(z.object({ project_id: uuid, provider: z.enum(['meshy', 'tripo', 'demo']), image_ids: z.array(uuid).max(200).optional(), settings: settingsSchema }), req.body);
    const id = await startGeneration(req.user.id, { ...body, mode: 'ai' });
    reply.code(201);
    return getGeneration(req.user.id, id);
  });

  app.get('/generations/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return getGeneration(req.user.id, id);
  });

  app.post('/generations/:id/cancel', { preHandler: requireAuth }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    await getGeneration(req.user.id, id);
    const ok = await cancelGeneration(id, req.user.id);
    if (!ok) throw badRequest('Only queued or running generations can be cancelled');
    return getGeneration(req.user.id, id);
  });

  /** Refine = start a new generation from the same project/images with adjusted settings (linked to the parent). */
  app.post('/generations/:id/refine', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const parent = await getGeneration(req.user.id, id);
    const overrides = parse(settingsSchema.partial(), (req.body as { settings?: unknown })?.settings ?? {});
    const settings = settingsSchema.parse({ ...parent.settings, ...overrides, parent_generation_id: id });
    const newId = await startGeneration(req.user.id, { project_id: parent.project_id, mode: parent.mode, provider: parent.provider, image_ids: parent.input_image_ids, settings });
    reply.code(201);
    return getGeneration(req.user.id, newId);
  });

  /** Provider webhooks are treated as hints only: the job re-polls the provider rather than trusting the payload. */
  app.post('/webhooks/:provider', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(['meshy', 'tripo']) }), req.params);
    const token = (req.query as { token?: string }).token ?? '';
    const secret = config.PROVIDER_WEBHOOK_SECRET;
    if (!secret || token.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))) throw new AppError(401, 'unauthorized', 'Invalid webhook token');
    const b = req.body as { id?: string; task_id?: string; data?: { task_id?: string } } | null;
    const taskId = b?.id ?? b?.task_id ?? b?.data?.task_id;
    if (!taskId) return { ok: true, matched: false };
    const job = await sqlOne<{ generation_id: string }>('select generation_id from generation_jobs where provider = $1 and provider_task_id = $2', [provider, String(taskId)]);
    if (job) await addEvent(job.generation_id, null, `Webhook received from ${provider}`);
    return { ok: true, matched: !!job };
  });
}
