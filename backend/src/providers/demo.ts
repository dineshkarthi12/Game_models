import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { run, workerScript } from '../utils/process.js';
import type { AIProvider, TaskState } from './types.js';

/**
 * Demo provider — clearly labelled, never presented as a reconstruction.
 * It procedurally builds a textured placeholder mesh in Blender (geometry depends on the asset category,
 * NOT on the uploaded photos) so the viewer, validation, refinement and export pipeline can be exercised
 * without paid API keys. Models it produces are stored with is_demo = true.
 */
const tasks = new Map<string, TaskState>();

export const demo: AIProvider = {
  id: 'demo', name: 'Demo (procedural, not from your photos)', isDemo: true,
  configured: () => config.DEMO_MODE,
  capabilities: {
    modes: ['single_image', 'multi_image'], max_images: 0, quality_levels: ['draft', 'standard', 'high', 'ultra'], texture_resolutions: ['none', '1k', '2k'],
    supports_pbr: true, supports_polycount: true, polycount_range: [500, 200_000], supports_topology: false, supports_remesh: false, supports_rigging: false,
    supports_symmetry: false, supports_texture_prompt: false, output_formats: ['glb'],
    notes: ['Generates a procedural placeholder model; your photos are not used.', 'For testing the pipeline only. Costs 0 credits.'],
  },
  selectInputs() { return { selected: [], reason: 'Demo mode does not use any uploaded images.' }; },
  async createTask(_images, s, ctx) {
    const out = path.join(ctx.workDir, 'demo.glb');
    const tex = s.texture_resolution === 'none' ? 0 : s.texture_resolution === '2k' ? 2048 : 1024;
    const target = s.polygon_level === 'custom' ? s.target_polycount ?? 20000 : { low: 4000, medium: 20000, high: 80000 }[s.polygon_level];
    const r = await run(config.BLENDER_BIN, ['-b', '--factory-startup', '-P', workerScript('model-processing', 'demo_model.py'), '--',
      out, s.category, String(target), String(tex)], { timeoutMs: 300_000 });
    const id = `demo-${Date.now()}`;
    if (r.code !== 0) tasks.set(id, { status: 'failed', progress: null, error: `Demo model generation failed: ${r.stderr.slice(-400) || r.stdout.slice(-400)}` });
    else { await fs.access(out); tasks.set(id, { status: 'succeeded', progress: null, outputs: { glb: `file://${out}` } }); }
    return { taskId: id, request: { category: s.category, target_triangles: target, texture: tex }, endpoint: 'local' };
  },
  async getTask(taskId) { return tasks.get(taskId) ?? { status: 'failed', progress: null, error: 'Demo task state lost (worker restarted)' }; },
};
