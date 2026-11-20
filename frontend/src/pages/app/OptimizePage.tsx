import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gamepad2, Check, X, AlertTriangle, Bone, Layers, Box } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, Label, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Callout, Skeleton, EmptyState, Segmented } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ModelViewer } from '@/viewer/ModelViewer';
import { useModelMetadata, useVersions } from '@/features/workspace/hooks';
import { useJobPoll } from '@/features/workspace/ValidationPanel';
import { http, errorMessage } from '@/services/api';
import type { Generation, ProcessingJob } from '@/types/api';
import { formatNumber, formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';

interface Preset { id: string; name: string; engine: string; budget: number; texture: number; lods: number[]; collision: 'convex' | 'box' | 'none'; normal_map: boolean }
interface GameCheck { id: string; label: string; status: 'pass' | 'warn' | 'fail'; critical: boolean; value: string; detail: string }

export default function OptimizePage() {
  const { id = '' } = useParams();
  const nav = useNavigate(); const qc = useQueryClient();
  const { data: meta, isLoading } = useModelMetadata(id);
  const { data: versions } = useVersions(id);
  const { data: presets } = useQuery({ queryKey: ['game-presets'], queryFn: () => http.get<{ items: Preset[] }>('/game-presets') });
  const [presetId, setPresetId] = useState('unreal_prop');
  const [cfg, setCfg] = useState<Omit<Preset, 'id' | 'name' | 'engine'> & { retopology: boolean }>({ budget: 8000, texture: 1024, lods: [1, 0.5, 0.25], collision: 'convex', normal_map: true, retopology: false });
  const [jobId, setJobId] = useState<string | null>(null);
  const [viewLod, setViewLod] = useState<string | null>(null);
  useEffect(() => { const p = presets?.items.find((x) => x.id === presetId); if (p) setCfg((c) => ({ ...c, budget: p.budget, texture: p.texture, lods: [...p.lods], collision: p.collision, normal_map: p.normal_map })); }, [presetId, presets]);
  const job = useJobPoll(jobId, async (j) => {
    setJobId(null);
    await Promise.all([qc.invalidateQueries({ queryKey: ['model-versions', id] }), qc.invalidateQueries({ queryKey: ['model-metadata', id] }), qc.invalidateQueries({ queryKey: ['models'] })]);
    if (j.status === 'succeeded') toast.success('Game asset created'); else toast.error(j.error ?? 'Optimisation failed');
  });

  if (isLoading || !meta) return <Skeleton className="h-[70vh]" />;
  const model = meta.model;
  if (!meta.version) return <EmptyState icon={<Box />} title="No model version available" />;
  const lods = (versions?.items ?? []).filter((v) => v.is_lod).sort((a, b) => (a.lod_level ?? 0) - (b.lod_level ?? 0));
  const latestLod0 = [...(versions?.items ?? [])].filter((v) => v.is_lod && v.lod_level === 0).sort((a, b) => b.version - a.version)[0];
  const report = (latestLod0?.params as { game_ready_report?: { game_ready: boolean; checks: GameCheck[] } } | undefined)?.game_ready_report;
  const collision = (latestLod0?.params as { collision?: { type: string; triangles: number } | null } | undefined)?.collision;
  const chain = latestLod0 ? [latestLod0, ...lods.filter((v) => (latestLod0.params as { lod_versions?: string[] }).lod_versions?.includes(v.id))] : [];
  const showing = chain.find((v) => v.id === viewLod) ?? chain[0] ?? meta.version;
  const isChar = ['human', 'creature', 'animal'].includes(model.category);

  async function run() {
    try { const j = await http.post<ProcessingJob>(`/models/${id}/optimize`, { preset: presetId, ...cfg }); setJobId(j.id); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function requestRig() {
    if (!model.generation_id) return;
    try { const g = await http.post<Generation>(`/generations/${model.generation_id}/refine`, { settings: { rig: true, category: model.category } }); nav(`/app/jobs/${g.id}`); } catch (e) { toast.error(errorMessage(e)); }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <Breadcrumbs items={[{ label: 'Projects', to: '/app/projects' }, { label: model.project_name ?? 'Project', to: `/app/projects/${model.project_id}` }, { label: model.name, to: `/app/models/${id}` }, { label: 'Game Asset Optimization' }]} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Gamepad2 className="size-6 text-brand" /> Game Asset Optimization</h1>
          <p className="mt-1 text-sm text-ink-muted">High-to-low conversion, UVs, baked normal maps, LODs and collision — checked before the asset is marked game-ready.</p></div>
        <div className="flex items-center gap-2">{model.game_ready ? <Badge tone="success"><Check className="size-3" /> Game-ready</Badge> : <Badge>Not yet game-ready</Badge>}
          <Link to={`/app/models/${id}`} className={buttonVariants({ variant: 'ghost' })}>Back to workspace</Link></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <Layers className="size-4 text-brand" /><span className="text-[13px] font-semibold">{chain.length ? 'LOD chain' : 'Source model'}</span>
              {chain.map((v) => (
                <button key={v.id} onClick={() => setViewLod(v.id)} className={cn('rounded-md border px-2.5 py-1 text-xs font-semibold', showing.id === v.id ? 'border-brand bg-brand-50 text-brand-600' : 'border-line text-ink-muted')}>
                  LOD{v.lod_level} · {v.stats ? formatNumber(v.stats.triangles) : '…'} tris
                </button>
              ))}
            </div>
            <ModelViewer url={showing.file_url} className="h-[52vh] min-h-[340px]" />
          </section>
          {report && (
            <section className="surface p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Game-readiness checks (LOD0)</h2>{report.game_ready ? <Badge tone="success">All critical checks passed</Badge> : <Badge tone="danger">Critical checks failed</Badge>}</div>
              <ul className="grid gap-2 md:grid-cols-2">
                {report.checks.map((c) => (
                  <li key={c.id} className="flex gap-2.5 rounded-lg border border-line p-3 text-[12.5px]">
                    <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-white', c.status === 'pass' ? 'bg-success' : c.status === 'warn' ? 'bg-warning' : 'bg-danger')}>
                      {c.status === 'pass' ? <Check className="size-2.5" /> : c.status === 'warn' ? <AlertTriangle className="size-2.5" /> : <X className="size-2.5" />}</span>
                    <div className="min-w-0"><p className="font-semibold">{c.label} <span className="font-normal text-ink-muted">· {c.value}</span>{c.critical && <span className="ml-1 text-[10px] uppercase text-ink-subtle">critical</span>}</p><p className="text-ink-muted">{c.detail}</p></div>
                  </li>
                ))}
              </ul>
              {collision && <p className="mt-3 text-xs text-ink-muted">Collision mesh: {collision.type}, {collision.triangles} triangles (exported as UCX_ for Unreal).</p>}
            </section>
          )}
          <section className="surface p-5">
            <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Bone className="size-4 text-brand" /> Rigging & skeleton</h2>
            {meta.stats?.has_skin ? <p className="text-[13px]">This model has a skeleton with {meta.stats.bone_count} bones and {meta.stats.animations} animation(s). It is preserved by FBX and GLB exports.</p>
              : isChar && meta.source?.mode === 'ai' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]"><p className="text-ink-muted">Not rigged. The AI provider can rig humanoid characters — this regenerates the model with rigging enabled (credits apply).</p><Button size="sm" variant="secondary" onClick={requestRig}>Request rigging</Button></div>
              ) : <p className="text-[13px] text-ink-muted">Not rigged. Automatic rigging is only offered for character, creature and animal models generated by a provider that supports it. Rig in Blender or Maya after export.</p>}
          </section>
        </div>

        <aside className="surface h-fit space-y-4 p-5">
          <div><Label htmlFor="preset">Engine preset</Label>
            <Select id="preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>{presets?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          <div><Label htmlFor="budget">Triangle budget (LOD0)</Label><Input id="budget" type="number" min={200} max={500000} value={cfg.budget} onChange={(e) => setCfg({ ...cfg, budget: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-ink-muted">Current version (input): {meta.stats ? formatNumber(meta.stats.triangles) : "—"} triangles</p></div>
          <div><Label>Texture size</Label><Segmented size="sm" ariaLabel="Texture size" value={String(cfg.texture) as '1024'} onChange={(v) => setCfg({ ...cfg, texture: Number(v) })}
            options={[512, 1024, 2048, 4096].map((n) => ({ value: String(n) as '1024', label: `${n / 1024 >= 1 ? `${n / 1024}K` : n}` }))} /></div>
          <div><Label>LOD levels</Label><Segmented size="sm" ariaLabel="LOD levels" value={String(cfg.lods.length) as '3'} onChange={(v) => setCfg({ ...cfg, lods: [[1], [1, 0.5], [1, 0.5, 0.25], [1, 0.5, 0.25, 0.1]][Number(v) - 1]! })}
            options={['1', '2', '3', '4'].map((n) => ({ value: n as '3', label: n === '1' ? 'LOD0' : `LOD0–${Number(n) - 1}` }))} />
            <p className="mt-1 text-xs text-ink-muted">{cfg.lods.map((r, i) => `LOD${i}: ${formatNumber(Math.round(cfg.budget * r))}`).join(' · ')}</p></div>
          <div><Label>Collision mesh</Label><Segmented size="sm" ariaLabel="Collision" value={cfg.collision} onChange={(v) => setCfg({ ...cfg, collision: v })} options={[{ value: 'convex', label: 'Convex hull' }, { value: 'box', label: 'Box' }, { value: 'none', label: 'None' }]} /></div>
          <label className="flex items-center justify-between text-[13px]"><span><span className="block font-medium">Bake normal map</span><span className="text-xs text-ink-muted">High-poly detail onto the low-poly</span></span><Switch checked={cfg.normal_map} onCheckedChange={(v) => setCfg({ ...cfg, normal_map: v })} label="Bake normal map" /></label>
          <label className="flex items-center justify-between text-[13px]"><span><span className="block font-medium">Retopology first</span><span className="text-xs text-ink-muted">Voxel remesh (closes holes) before reduction</span></span><Switch checked={cfg.retopology} onCheckedChange={(v) => setCfg({ ...cfg, retopology: v })} label="Retopology" /></label>
          <Callout tone="info">Produces LOD0 as the new current version plus LOD versions. Ambient-occlusion baking is not available in this build.</Callout>
          <Button className="w-full" size="lg" onClick={run} loading={!!jobId}><Gamepad2 /> {jobId ? `Optimising… (${job?.status ?? 'queued'})` : 'Create game-ready asset'}</Button>
          {latestLod0 && <p className="text-center text-xs text-ink-muted">Last LOD0: v{latestLod0.version} · {formatBytes(latestLod0.file_size)}</p>}
        </aside>
      </div>
    </div>
  );
}
