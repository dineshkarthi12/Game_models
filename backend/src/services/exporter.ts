import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sql, sqlOne } from '../database/pool.js';
import { storage, keys } from '../storage/index.js';
import { makeWorkDir, run, workerScript } from '../utils/process.js';
import { notify } from './notifications.js';
import { recalcStorage } from './storageUsage.js';
import { EXPORT_PRESETS } from './exportPresets.js';

const MAGIC: Record<string, (b: Buffer, size: number) => boolean> = {
  fbx: (b) => b.toString('latin1', 0, 18) === 'Kaydara FBX Binary',
  glb: (b) => b.toString('ascii', 0, 4) === 'glTF',
  gltf: (b) => /"asset"\s*:/.test(b.toString('utf8')),
  obj: (b) => /(^|\n)v\s/.test(b.toString('utf8')),
  usd: (b) => b.toString('ascii', 0, 8) === 'PXR-USDC',
  usdz: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4,
  stl: (b, size) => size >= 84 && 84 + 50 * b.readUInt32LE(80) === size,
};

async function verifyFile(fmt: string, file: string, expectedTris: number | null) {
  const st = await fs.stat(file);
  const head = Buffer.alloc(Math.min(st.size, fmt === 'gltf' || fmt === 'obj' ? 65536 : 96));
  const fh = await fs.open(file, 'r'); await fh.read(head, 0, head.length, 0); await fh.close();
  const magicOk = MAGIC[fmt]?.(head, st.size) ?? false;
  const r = fmt === 'usd' || fmt === 'usdz'
    ? await run(config.PYTHON_BIN, [workerScript('export-processing', 'usd_export.py'), 'verify', file], { timeoutMs: 120_000 })
    : await run(config.BLENDER_BIN, ['-b', '--factory-startup', '-P', workerScript('export-processing', 'verify.py'), '--', file], { timeoutMs: 300_000 });
  const line = r.stdout.split('\n').find((l) => l.startsWith('VERIFY '));
  let info: { ok: boolean; error?: string; triangles?: number; meshes?: number; images?: number };
  try { info = line ? JSON.parse(line.slice(7)) : { ok: false, error: 'no verification output' }; } catch { info = { ok: false, error: 'unreadable verification output' }; }
  const triOk = expectedTris == null || (info.triangles != null && Math.abs(info.triangles - expectedTris) <= Math.max(2, expectedTris * 0.01));
  const ok = magicOk && info.ok && triOk;
  const tool = fmt.startsWith('usd') ? 'Pixar USD (pxr)' : 'Blender importer';
  const validation = ok
    ? `Re-imported with ${tool}: ${info.meshes} mesh(es), ${info.triangles} triangles${info.images ? `, ${info.images} texture(s)` : ''}.`
    : `Validation failed: ${!magicOk ? 'unexpected file signature; ' : ''}${info.error ?? ''}${!triOk ? `triangle count ${info.triangles} ≠ expected ${expectedTris}` : ''}`;
  return { ok, info, validation, size: st.size };
}

function readme(name: string, presetKey: string, s: Record<string, unknown>, files: { name: string; validated: boolean }[], meta: Record<string, unknown>) {
  const p = EXPORT_PRESETS[presetKey];
  return `# ${name}

Exported by Vistora 3D for **${p?.name ?? presetKey}** on ${new Date().toISOString()}.

## Contents
${files.map((f) => `- \`${f.name}\`${f.validated ? '' : ' (validation failed — see metadata.json)'}`).join('\n')}

## Settings
- Units: ${s.units} · Up axis: ${s.up_axis} · Forward axis: ${s.forward_axis} · Scale: ${s.scale}
- Texture resolution: ${s.texture_resolution} · Triangulated: ${s.triangulate ? 'yes' : 'no'}
- Included: ${['textures', 'materials', 'normals', 'uvs', 'skeleton', 'animation', 'collision'].filter((k) => s[`include_${k}`]).join(', ')}

## Import notes
${(p?.notes ?? []).map((n) => `- ${n}`).join('\n')}

## Provenance
- Source: ${meta.source}${meta.is_demo ? ' (DEMO — procedural, not reconstructed from photographs)' : ''}
- Version: v${meta.version} (${meta.version_label})
- Scale: ${meta.scale_calibrated ? 'calibrated to real-world units' : 'relative — not calibrated to real-world size'}
- ${meta.source === 'ai' ? 'Geometry was estimated by an AI model; unseen regions are generated, not measured.' : meta.source === 'photogrammetry' ? 'Geometry was reconstructed by photogrammetry (COLMAP).' : ''}

Every file listed above was re-imported after export to check that it opens and contains the expected geometry.
`;
}

export async function processExportJob(data: { exportId: string }) {
  const job = await sqlOne<{ id: string; owner_id: string; model_id: string; version_id: string; preset: string; formats: string[]; settings: Record<string, unknown> }>('select * from export_jobs where id = $1', [data.exportId]);
  if (!job) return;
  await sql(`update export_jobs set status = 'running', stage = 'preparing' where id = $1`, [job.id]);
  const work = await makeWorkDir('export');
  try {
    const s = job.settings as Record<string, unknown> & { lods?: number[]; include_collision?: boolean; units: string; up_axis: string };
    const m = await sqlOne<{ name: string; source: string; is_demo: boolean }>('select name, source, is_demo from models where id = $1', [job.model_id]);
    const v = await sqlOne<{ id: string; storage_key: string; version: number; label: string; params: Record<string, unknown> }>('select id, storage_key, version, label, params from model_versions where id = $1', [job.version_id]);
    const md = await sqlOne<{ stats: { triangles: number; scale_calibrated?: boolean } }>('select stats from model_metadata where version_id = $1', [job.version_id]);
    if (!m || !v || !md) throw new Error('Model version or its statistics are not available');
    const inputs = path.join(work, 'in'); await fs.mkdir(inputs);
    const main = path.join(inputs, 'main.glb'); await storage.download(v.storage_key, main);
    // LODs produced by the game pipeline for this LOD0 version.
    const lodIds = (v.params?.lod_versions as string[] | undefined) ?? [];
    const lods: { level: number; path: string; tris: number }[] = [];
    if (s.lods?.length && lodIds.length) {
      const rows = await sql<{ storage_key: string; lod_level: number; tris: number }>(
        `select v.storage_key, v.lod_level, (md.stats->>'triangles')::int as tris from model_versions v join model_metadata md on md.version_id = v.id where v.id = any($1::uuid[])`, [lodIds]);
      for (const r of rows.filter((x) => s.lods!.includes(x.lod_level))) {
        const p = path.join(inputs, `lod${r.lod_level}.glb`); await storage.download(r.storage_key, p); lods.push({ level: r.lod_level, path: p, tris: r.tris });
      }
    }
    let collision: string | null = null;
    const ck = (v.params?.collision as { key?: string } | null)?.key;
    if (s.include_collision && ck) { collision = path.join(inputs, 'collision.glb'); await storage.download(ck, collision); }

    const out = path.join(work, 'out');
    const name = m.name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'Model';
    await sql(`update export_jobs set stage = 'converting' where id = $1`, [job.id]);
    const blenderFormats = job.formats.filter((f) => !f.startsWith('usd'));
    if (blenderFormats.length) {
      const cfgPath = path.join(work, 'export.json');
      await fs.writeFile(cfgPath, JSON.stringify({ out_dir: out, name, main, lods: lods.map((l) => ({ level: l.level, path: l.path })), collision, preset: job.preset, formats: blenderFormats, settings: s }));
      const r = await run(config.BLENDER_BIN, ['-b', '--factory-startup', '-P', workerScript('export-processing', 'export.py'), '--', cfgPath], { timeoutMs: 30 * 60_000 });
      if (r.code !== 0 || !r.stdout.includes('EXPORT_DONE')) throw new Error(`Blender export failed: ${(r.stdout + r.stderr).split('\n').filter((l) => /Error/.test(l)).slice(-3).join(' ')}`);
    }
    const usdFormats = job.formats.filter((f) => f.startsWith('usd'));
    if (usdFormats.length) {
      const ucfg = path.join(work, 'usd.json');
      await fs.writeFile(ucfg, JSON.stringify({ out_dir: out, name, items: [{ label: 'main', glb: main }, ...lods.map((l) => ({ label: `LOD${l.level}`, glb: l.path }))], formats: usdFormats, units: s.units, up_axis: s.up_axis }));
      const r = await run(config.PYTHON_BIN, [workerScript('export-processing', 'usd_export.py'), 'export', ucfg], { timeoutMs: 20 * 60_000 });
      if (r.code !== 0) throw new Error(`USD export failed: ${r.stderr.slice(-300)}`);
    }

    // Validate every exported model file by re-importing it.
    await sql(`update export_jobs set stage = 'validating' where id = $1`, [job.id]);
    const EXT: Record<string, string> = { fbx: '.fbx', glb: '.glb', gltf: '.gltf', obj: '.obj', usd: '.usdc', usdz: '.usdz', stl: '.stl' };
    const files: { name: string; format: string; size: number; validated: boolean; validation: string }[] = [];
    for (const fmt of job.formats) {
      const dir = path.join(out, fmt.toUpperCase());
      const entries = await fs.readdir(dir).catch(() => [] as string[]);
      for (const f of entries.filter((e) => e.endsWith(EXT[fmt]!))) {
        const lodMatch = f.match(/_LOD(\d+)\./); const isCol = f.includes('_collision.');
        const expected = isCol ? null : lodMatch ? lods.find((l) => l.level === Number(lodMatch[1]))?.tris ?? null : md.stats.triangles;
        const r = await verifyFile(fmt, path.join(dir, f), fmt === 'stl' || s.triangulate === false ? (fmt === 'stl' ? expected : null) : expected);
        files.push({ name: `${fmt.toUpperCase()}/${f}`, format: fmt, size: r.size, validated: r.ok, validation: r.validation });
      }
    }
    const failedMain = files.filter((f) => !f.validated);
    if (!files.length || files.every((f) => !f.validated)) throw new Error(`No exported file passed validation. ${failedMain.map((f) => `${f.name}: ${f.validation}`).join(' | ').slice(0, 600)}`);

    // Package: model files (validated ones only), textures, metadata, README.
    await sql(`update export_jobs set stage = 'packaging' where id = $1`, [job.id]);
    const metadata = {
      generator: 'Vistora 3D', exported_at: new Date().toISOString(), model: m.name, source: m.source, is_demo: m.is_demo, version: v.version, version_label: v.label,
      preset: job.preset, formats: job.formats, settings: s, scale_calibrated: !!(md.stats.scale_calibrated ?? v.params?.scale_calibrated), triangles: md.stats.triangles,
      lods: lods.map((l) => ({ level: l.level, triangles: l.tris })), collision: !!collision, files,
    };
    await fs.writeFile(path.join(out, 'metadata.json'), JSON.stringify(metadata, null, 2));
    await fs.writeFile(path.join(out, 'README.md'), readme(m.name, job.preset, s, files, metadata));
    for (const f of files.filter((x) => !x.validated)) await fs.rm(path.join(out, f.name), { force: true });
    const include = ['README.md', 'metadata.json', ...new Set(job.formats.map((f) => f.toUpperCase())), ...(s.include_textures ? ['Textures'] : [])];
    const zipName = `${name}_${job.preset}_v${v.version}.zip`;
    const zipPath = path.join(work, zipName);
    const z = await run(config.PYTHON_BIN, [workerScript('export-processing', 'package.py'), out, zipPath, `${name}_${job.preset}`, JSON.stringify(include)], { timeoutMs: 10 * 60_000 });
    if (z.code !== 0) throw new Error(`Packaging failed: ${z.stderr.slice(-300)}`);
    const key = keys.exportPkg(job.owner_id, job.id, zipName);
    const size = await storage.putFile(key, zipPath, 'application/zip');
    await sql(`update export_jobs set status = 'succeeded', stage = 'completed', files = $2, package_key = $3, package_size = $4, completed_at = now() where id = $1`,
      [job.id, JSON.stringify(files), key, size]);
    await recalcStorage(job.owner_id);
    await notify(job.owner_id, 'export_ready', 'Export ready', `${m.name} · ${EXPORT_PRESETS[job.preset]?.name ?? job.preset} · ${files.filter((f) => f.validated).length} validated file(s)`, `/app/exports?highlight=${job.id}`);
  } catch (e) {
    await sql(`update export_jobs set status = 'failed', error = $2, completed_at = now() where id = $1`, [job.id, (e as Error).message.slice(0, 1500)]);
    throw e;
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}
