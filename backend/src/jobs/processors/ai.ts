import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { sql, sqlOne } from '../../database/pool.js';
import { getProvider } from '../../providers/index.js';
import { downloadTo } from '../../providers/http.js';
import { ProviderError, type InputImage, type TaskState } from '../../providers/types.js';
import { addEvent, failGeneration, isCancelled, setProgress, refreshProjectStatus } from '../../services/generations.js';
import { createVersionFromFile } from '../../services/models.js';
import { makeWorkDir, materialize } from '../../utils/process.js';
import { enqueue } from '../queues.js';
import { logger } from '../../utils/logger.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cancelled extends Error {}

async function poll(genId: string, provider: NonNullable<ReturnType<typeof getProvider>>, taskId: string, endpoint: string, label: string): Promise<TaskState> {
  const started = Date.now(); let lastStatus = ''; let errors = 0;
  for (;;) {
    if (await isCancelled(genId)) {
      await provider.cancelTask?.(taskId, endpoint).catch(() => {});
      throw new Cancelled();
    }
    let s: TaskState;
    try { s = await provider.getTask(taskId, endpoint); errors = 0; }
    catch (e) {
      // Transient polling errors are tolerated a few times; the task keeps running at the provider.
      if (++errors > 5 || (e instanceof ProviderError && !e.retryable)) throw e;
      await sleep(config.PROVIDER_POLL_INTERVAL_MS * errors); continue;
    }
    if (s.status !== lastStatus) {
      lastStatus = s.status;
      const stage = s.status === 'queued' ? 'queued_at_provider' : s.status === 'running' ? label : s.status;
      await addEvent(genId, stage, `${provider.name}: task ${s.status}`);
    }
    await setProgress(genId, s.progress, s.progress == null ? null : `${provider.name} task progress`);
    if (s.status === 'succeeded' || s.status === 'failed' || s.status === 'cancelled') return s;
    if (Date.now() - started > config.PROVIDER_TIMEOUT_MS) throw new ProviderError(provider.id, `Timed out after ${Math.round(config.PROVIDER_TIMEOUT_MS / 60000)} minutes waiting for ${provider.name}`);
    await sleep(config.PROVIDER_POLL_INTERVAL_MS);
  }
}

/**
 * ai-generation processor. Resumable: if a provider task was already created (worker restart / retry),
 * it resumes polling that task instead of creating — and paying for — a new one.
 */
export async function processAiGeneration(data: { generationId: string }, attempt: { attemptsMade: number; maxAttempts: number }) {
  const gen = await sqlOne<{ id: string; owner_id: string; project_id: string; provider: string; status: string; settings: Record<string, unknown>; input_image_ids: string[] }>(
    'select * from generations where id = $1', [data.generationId]);
  if (!gen || gen.status === 'cancelled' || gen.status === 'succeeded' || gen.status === 'failed') return;
  const provider = getProvider(gen.provider);
  if (!provider || !provider.configured()) return failGeneration(gen.id, `${gen.provider} is not configured on this server (CONFIGURATION REQUIRED).`);

  await sql(`update generations set status = 'running', started_at = coalesce(started_at, now()) where id = $1`, [gen.id]);
  await refreshProjectStatus(gen.project_id);
  const work = await makeWorkDir('ai');
  try {
    let job = await sqlOne<{ id: string; provider_task_id: string; request: { endpoint?: string } }>(
      `select * from generation_jobs where generation_id = $1 and kind = 'generate' and provider_task_id is not null order by created_at desc limit 1`, [gen.id]);
    if (job) {
      await addEvent(gen.id, null, `Resuming existing ${provider.name} task ${job.provider_task_id}`);
    } else {
      await addEvent(gen.id, 'validating', 'Validating reference images');
      const rows = await sql<{ id: string; storage_key: string; mime_type: string; angle: string; width: number; height: number; quality: InputImage['quality'] }>(
        'select id, storage_key, mime_type, angle, width, height, quality from project_images where id = any($1::uuid[]) order by sort_order', [gen.input_image_ids]);
      if (!provider.isDemo && !rows.length) return failGeneration(gen.id, 'No reference images are available for this generation');
      const images: InputImage[] = await Promise.all(rows.map(async (r) => ({ id: r.id, path: await materialize(r.storage_key, work), mime: r.mime_type, angle: r.angle, width: r.width, height: r.height, quality: r.quality })));
      const { selected, reason } = provider.selectInputs(images);
      await sql('update generations set used_image_ids = $2 where id = $1', [gen.id, selected.map((s) => s.id)]);
      await addEvent(gen.id, 'uploading', reason, provider.isDemo ? 'warning' : 'info', { used: selected.length, provided: images.length });
      const created = await provider.createTask(selected, gen.settings as never, { workDir: work });
      const ins = await sqlOne<{ id: string; provider_task_id: string }>(
        `insert into generation_jobs (generation_id, owner_id, provider, kind, provider_task_id, status, request) values ($1,$2,$3,'generate',$4,'running',$5) returning id, provider_task_id`,
        [gen.id, gen.owner_id, provider.id, created.taskId, JSON.stringify({ endpoint: created.endpoint, body: created.request })]);
      job = { ...ins!, request: { endpoint: created.endpoint } };
      await addEvent(gen.id, 'queued_at_provider', `${provider.name} task created`, 'info', { task_id: created.taskId, endpoint: created.endpoint });
    }

    let state = await poll(gen.id, provider, job.provider_task_id, job.request.endpoint ?? '', 'generating_geometry');
    await sql(`update generation_jobs set status = $2, response = $3 where id = $1`, [job.id, state.status, JSON.stringify(state.raw ?? null)]);
    if (state.status !== 'succeeded') return failGeneration(gen.id, state.error ?? `${provider.name} task ${state.status}`);

    const s = gen.settings as { rig?: boolean; category?: string };
    if (s.rig && provider.capabilities.supports_rigging && provider.createRigTask) {
      await addEvent(gen.id, 'rigging', `Requesting ${provider.name} rigging`);
      try {
        const rig = await provider.createRigTask(job.provider_task_id, gen.settings as never);
        await sql(`insert into generation_jobs (generation_id, owner_id, provider, kind, provider_task_id, status, request) values ($1,$2,$3,'rig',$4,'running',$5)`,
          [gen.id, gen.owner_id, provider.id, rig.taskId, JSON.stringify({ endpoint: rig.endpoint, body: rig.request })]);
        const rs = await poll(gen.id, provider, rig.taskId, rig.endpoint, 'rigging');
        if (rs.status === 'succeeded' && rs.outputs?.glb) state = rs;
        else await addEvent(gen.id, 'rigging', `Rigging did not complete (${rs.error ?? rs.status}); the unrigged model is kept.`, 'warning');
      } catch (e) {
        await addEvent(gen.id, 'rigging', `Rigging unavailable: ${(e as Error).message}. The unrigged model is kept.`, 'warning');
      }
    }

    const url = state.outputs?.glb;
    if (!url) return failGeneration(gen.id, `${provider.name} reported success but returned no GLB file`);
    await addEvent(gen.id, 'downloading', 'Downloading model files');
    await setProgress(gen.id, null, null);
    const glb = path.join(work, 'result.glb');
    if (url.startsWith('file://')) await fs.copyFile(url.slice(7), glb); else await downloadTo(provider.id, url, glb);
    const head = Buffer.alloc(4); const fh = await fs.open(glb, 'r'); await fh.read(head, 0, 4, 0); await fh.close();
    if (head.toString('ascii') !== 'glTF') return failGeneration(gen.id, 'Downloaded file is not a valid GLB');

    await addEvent(gen.id, 'finalizing', 'Storing model and creating version 1');
    const project = await sqlOne<{ name: string; category: string }>('select name, category from projects where id = $1', [gen.project_id]);
    const model = await sqlOne<{ id: string }>(
      `insert into models (owner_id, project_id, generation_id, name, category, source, provider, is_demo, status) values ($1,$2,$3,$4,$5,'ai',$6,$7,'processing') returning id`,
      [gen.owner_id, gen.project_id, gen.id, `${project?.name ?? 'Model'}${provider.isDemo ? ' (demo)' : ''}`, (s.category as string) ?? project?.category ?? 'custom', provider.id, provider.isDemo]);
    const v = await createVersionFromFile({ ownerId: gen.owner_id, modelId: model!.id, filePath: glb, label: provider.isDemo ? 'Demo output' : `${provider.name} output`, operation: 'generate',
      params: { provider: provider.id, task_id: job.provider_task_id, rigged: state !== null && !!s.rig } });
    await sql(`update generations set status = 'succeeded', model_id = $2, completed_at = now(), progress = null, stage = 'completed' where id = $1`, [gen.id, model!.id]);
    await addEvent(gen.id, 'completed', 'Model stored. Measuring statistics and rendering thumbnail.');
    await enqueue('processing', 'analyze', { modelId: model!.id, versionId: v.id, generationId: gen.id });
    await refreshProjectStatus(gen.project_id);
  } catch (e) {
    if (e instanceof Cancelled) return;
    const retryable = e instanceof ProviderError && e.retryable && attempt.attemptsMade + 1 < attempt.maxAttempts;
    logger.error({ err: e, genId: gen.id, retryable }, 'ai generation error');
    if (retryable) { await addEvent(gen.id, null, `Temporary error, will retry: ${(e as Error).message}`, 'warning'); throw e; }
    await failGeneration(gen.id, (e as Error).message);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
