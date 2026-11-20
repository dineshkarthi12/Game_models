import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wand2, RotateCcw, Sparkles, ArrowRight, Box } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, Input, Label } from '@/components/ui/input';
import { Callout, Skeleton, EmptyState, Segmented } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ModelViewer } from '@/viewer/ModelViewer';
import { useModelMetadata, useVersions } from '@/features/workspace/hooks';
import { useJobPoll } from '@/features/workspace/ValidationPanel';
import { http, errorMessage } from '@/services/api';
import type { Generation, ProcessingJob } from '@/types/api';
import { formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';

type Tool = { id: string; label: string; hint: string; enabled: boolean; params: Record<string, number | string> };
const INITIAL: Tool[] = [
  { id: 'cleanup', label: 'Geometry Cleanup', hint: 'Merge duplicate vertices, remove loose geometry and small floating parts', enabled: true, params: { min_component_ratio: 0.01 } },
  { id: 'fill_holes', label: 'Hole Filling', hint: 'Close open boundaries (0 = any size). Required before retopology of scans.', enabled: false, params: { max_sides: 0 } },
  { id: 'remesh', label: 'Retopology', hint: 'Voxel remesh to clean, even topology. Texture is transferred to the new UVs.', enabled: false, params: { resolution: 260 } },
  { id: 'smooth', label: 'Surface Smoothing', hint: 'Laplacian smoothing with volume preservation', enabled: false, params: { iterations: 4, factor: 0.5 } },
  { id: 'decimate', label: 'Polygon Reduction', hint: 'Quadric edge-collapse to a triangle budget; keeps UVs', enabled: false, params: { target_triangles: 20000 } },
  { id: 'normals', label: 'Normal Correction', hint: 'Recalculate consistent outward normals', enabled: true, params: { shading: 'smooth' } },
  { id: 'texture_enhance', label: 'Texture Enhancement', hint: 'Unsharp mask + mild auto-contrast on the base-colour map (no generated detail)', enabled: false, params: { amount: 0.8, contrast: 0.5 } },
  { id: 'scale', label: 'Scale Correction', hint: 'Scale uniformly so one dimension matches a real measurement', enabled: false, params: { axis: 'y', value: 30, unit: 'cm' } },
  { id: 'material', label: 'Material Editing', hint: 'Tint base colour and set roughness / metallic for all materials', enabled: false, params: { base_color: '#ffffff', roughness: 0.7, metallic: 0 } },
];
const ORDER = ['cleanup', 'fill_holes', 'remesh', 'smooth', 'decimate', 'normals', 'scale', 'material', 'texture_enhance'];

export default function RefinementPage() {
  const { id = '' } = useParams();
  const nav = useNavigate(); const qc = useQueryClient();
  const { data: meta, isLoading } = useModelMetadata(id);
  const { data: versions } = useVersions(id);
  const [tools, setTools] = useState<Tool[]>(INITIAL);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<{ before: string; after: string } | null>(null);
  const set = (tid: string, patch: Partial<Tool>) => setTools((ts) => ts.map((t) => (t.id === tid ? { ...t, ...patch } : t)));
  const setParams = (tid: string, patch: Record<string, number | string>) => setTools((ts) => ts.map((t) => (t.id === tid ? { ...t, params: { ...t.params, ...patch } } : t)));
  const job = useJobPoll(jobId, async (j) => {
    setJobId(null);
    if (j.status === 'succeeded' && j.result_version_id) {
      setResult({ before: j.version_id!, after: j.result_version_id });
      await Promise.all([qc.invalidateQueries({ queryKey: ['model-versions', id] }), qc.invalidateQueries({ queryKey: ['model-metadata', id] }), qc.invalidateQueries({ queryKey: ['models'] })]);
      toast.success('Refinement complete — new version created');
    } else toast.error(j.error ?? 'Refinement failed');
  });
  const ops = useMemo(() => {
    const on = tools.filter((t) => t.enabled);
    // Retopology of open scans needs closed volumes: add hole filling automatically.
    if (on.some((t) => t.id === 'remesh') && !on.some((t) => t.id === 'fill_holes')) on.push(INITIAL.find((t) => t.id === 'fill_holes')!);
    return on.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)).map((t) => ({ op: t.id, ...t.params }));
  }, [tools]);

  if (isLoading || !meta) return <Skeleton className="h-[70vh]" />;
  const model = meta.model;
  if (!meta.version) return <EmptyState icon={<Box />} title="No model version to refine" />;
  const vBefore = versions?.items.find((v) => v.id === (result?.before ?? meta.version!.id)) ?? meta.version;
  const vAfter = result ? versions?.items.find((v) => v.id === result.after) : null;

  async function apply() {
    try { const j = await http.post<ProcessingJob>(`/models/${id}/refine`, { operations: ops }); setJobId(j.id); setResult(null); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function revert() {
    if (!result) return;
    try { await http.put(`/models/${id}/current-version`, { version_id: result.before }); toast.success('Reverted to the previous version'); await qc.invalidateQueries({ queryKey: ['model-metadata', id] }); setResult(null); }
    catch (e) { toast.error(errorMessage(e)); }
  }
  async function regenerate() {
    if (!model.generation_id) return;
    try { const g = await http.post<Generation>(`/generations/${model.generation_id}/refine`, { settings: {} }); nav(`/app/jobs/${g.id}`); } catch (e) { toast.error(errorMessage(e)); }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <Breadcrumbs items={[{ label: 'Projects', to: '/app/projects' }, { label: model.project_name ?? 'Project', to: `/app/projects/${model.project_id}` }, { label: model.name, to: `/app/models/${id}` }, { label: 'Refinement' }]} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Wand2 className="size-6 text-brand" /> Model Refinement</h1><p className="mt-1 text-sm text-ink-muted">Improve geometry, textures and materials. Every refinement creates a new version; nothing is overwritten.</p></div>
        <div className="flex gap-2">
          {model.generation_id && <Button variant="secondary" onClick={regenerate}><Sparkles /> Regenerate model</Button>}
          <Link to={`/app/models/${id}`} className={buttonVariants({ variant: 'ghost' })}>Back to workspace</Link>
        </div>
      </div>
      {model.is_demo && <Callout tone="warning" className="mb-4">Demo model: refinement works, but the source geometry is procedural.</Callout>}
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="surface p-3">
          <div className="grid gap-2 md:grid-cols-2">
            {[vBefore, vAfter].map((v, i) => (
              <div key={i} className="relative overflow-hidden rounded-lg border border-line bg-canvas">
                <span className={cn('absolute left-2 top-2 z-10 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white', i === 0 ? 'bg-ink/80' : 'bg-brand')}>{i === 0 ? 'Before' : 'After (Refined)'}{v ? ` · v${v.version}` : ''}</span>
                {v ? <ModelViewer url={v.file_url} syncId={`ref-${i}`} className="h-[58vh] min-h-[360px]" />
                  : <div className="grid h-[58vh] min-h-[360px] place-items-center p-6 text-center text-sm text-ink-muted">{jobId ? `Refining… (${job?.status ?? 'queued'})` : 'Select tools and apply refinement to see the result here.'}</div>}
              </div>
            ))}
          </div>
          {vAfter && vBefore && (
            <div className="mt-3 grid gap-2 rounded-lg bg-canvas p-3 text-[13px] sm:grid-cols-4">
              {[['Triangles', vBefore.stats?.triangles, vAfter.stats?.triangles], ['Vertices', vBefore.stats?.vertices, vAfter.stats?.vertices], ['File size (KB)', Math.round(vBefore.file_size / 1024), Math.round(vAfter.file_size / 1024)]].map(([k, a, b]) => (
                <div key={k as string}><p className="text-xs text-ink-muted">{k}</p><p className="font-semibold tabular-nums">{a != null ? formatNumber(a as number) : '…'} <ArrowRight className="inline size-3" /> {b != null ? formatNumber(b as number) : 'measuring…'}</p></div>
              ))}
              <div className="flex items-center justify-end gap-2"><Button size="sm" variant="secondary" onClick={revert}><RotateCcw /> Revert</Button><Link to={`/app/models/${id}?tab=validation`} className={buttonVariants({ size: 'sm' })}>Validate</Link></div>
            </div>
          )}
        </section>

        <aside className="surface h-fit p-4">
          <h2 className="mb-3 text-[15px] font-semibold">Refinement Tools</h2>
          <div className="space-y-2">
            {tools.map((t) => (
              <div key={t.id} className={cn('rounded-lg border p-3', t.enabled ? 'border-brand-200 bg-brand-50/40' : 'border-line')}>
                <div className="flex items-start justify-between gap-3">
                  <label htmlFor={`tool-${t.id}`} className="min-w-0"><span className="block text-[13px] font-semibold">{t.label}</span><span className="block text-[11.5px] text-ink-muted">{t.hint}</span></label>
                  <Switch id={`tool-${t.id}`} checked={t.enabled} onCheckedChange={(c) => set(t.id, { enabled: c })} label={t.label} />
                </div>
                {t.enabled && <ToolParams tool={t} onChange={(p) => setParams(t.id, p)} />}
              </div>
            ))}
          </div>
          {ops.some((o) => o.op === 'remesh') && <Callout tone="info" className="mt-3">Retopology replaces the mesh and UVs; the texture is re-projected from the previous version.</Callout>}
          <Button className="mt-4 w-full" size="lg" onClick={apply} loading={!!jobId} disabled={!ops.length}><Wand2 /> Apply Refinement</Button>
          <p className="mt-2 text-center text-[11px] text-ink-muted">Runs on processing workers (Blender). Order: {ops.map((o) => o.op).join(' → ') || '—'}</p>
          {result && <p className="mt-2 text-center"><Badge tone="success">New version is now current</Badge></p>}
        </aside>
      </div>
    </div>
  );
}

function ToolParams({ tool, onChange }: { tool: Tool; onChange: (p: Record<string, number | string>) => void }) {
  const p = tool.params;
  const slider = (k: string, label: string, min: number, max: number, step: number) => (
    <label key={k} className="mt-2 flex items-center gap-3 text-xs"><span className="w-24 shrink-0 text-ink-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={Number(p[k])} onChange={(e) => onChange({ [k]: Number(e.target.value) })} className="flex-1 accent-brand" aria-label={`${tool.label} ${label}`} />
      <span className="w-14 text-right font-semibold tabular-nums">{p[k]}</span></label>
  );
  switch (tool.id) {
    case 'cleanup': return slider('min_component_ratio', 'Min part size', 0, 0.2, 0.005);
    case 'fill_holes': return slider('max_sides', 'Max hole edges', 0, 2000, 10);
    case 'remesh': return slider('resolution', 'Resolution', 60, 500, 10);
    case 'smooth': return <>{slider('iterations', 'Iterations', 1, 20, 1)}{slider('factor', 'Strength', 0.05, 1.5, 0.05)}</>;
    case 'decimate': return slider('target_triangles', 'Target tris', 500, 200000, 500);
    case 'texture_enhance': return <>{slider('amount', 'Sharpen', 0, 2, 0.1)}{slider('contrast', 'Contrast clip %', 0, 3, 0.1)}</>;
    case 'normals': return <div className="mt-2"><Segmented size="sm" ariaLabel="Shading" value={p.shading as 'smooth' | 'flat'} onChange={(v) => onChange({ shading: v })} options={[{ value: 'smooth', label: 'Smooth' }, { value: 'flat', label: 'Flat' }]} /></div>;
    case 'scale': return (
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Select aria-label="Axis" className="h-8 py-0 text-xs" value={p.axis as string} onChange={(e) => onChange({ axis: e.target.value })}><option value="x">Width</option><option value="y">Height</option><option value="z">Depth</option><option value="longest">Longest</option></Select>
        <Input aria-label="Real size" type="number" min={0.01} step="any" className="h-8 text-xs" value={p.value} onChange={(e) => onChange({ value: Number(e.target.value) })} />
        <Select aria-label="Unit" className="h-8 py-0 text-xs" value={p.unit as string} onChange={(e) => onChange({ unit: e.target.value })}><option>mm</option><option>cm</option><option>m</option><option>in</option></Select>
      </div>);
    case 'material': return (
      <div className="mt-1">
        <Label className="mt-2 flex items-center justify-between text-xs font-normal">Base colour tint<input type="color" value={p.base_color as string} onChange={(e) => onChange({ base_color: e.target.value })} className="h-6 w-10 rounded border border-line" aria-label="Base colour tint" /></Label>
        {slider('roughness', 'Roughness', 0, 1, 0.05)}{slider('metallic', 'Metallic', 0, 1, 0.05)}
      </div>);
    default: return null;
  }
}
