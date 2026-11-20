import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2, Circle, X, Minus, AlertTriangle, Box, RotateCcw, ScrollText, Sparkles, ScanLine } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { ProgressBar, Callout, Skeleton, EmptyState } from '@/components/ui/misc';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Stepper } from '@/components/Stepper';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { http, errorMessage } from '@/services/api';
import { useInvalidate } from '@/hooks/queries';
import { useImages } from '@/features/upload/hooks';
import { ANGLE_LABELS } from '@/features/upload/angles';
import type { Generation } from '@/types/api';
import { formatDateTime, formatDuration, titleCase } from '@/utils/format';
import { cn } from '@/utils/cn';

const AI_STAGES = [
  ['validating', 'Validating references'], ['uploading', 'Uploading to provider'], ['queued_at_provider', 'Queued at provider'],
  ['generating_geometry', 'Generating geometry & textures'], ['rigging', 'Rigging'], ['downloading', 'Downloading result'], ['finalizing', 'Storing model'], ['completed', 'Completed'],
] as const;
const PG_STAGES = [
  ['validating', 'Validating images'], ['feature_extraction', 'Extracting features'], ['feature_matching', 'Matching features'], ['sparse_reconstruction', 'Estimating cameras & sparse cloud'],
  ['dense_reconstruction', 'Dense reconstruction'], ['meshing', 'Generating mesh'], ['texturing', 'Texturing'], ['scale_calibration', 'Calibrating scale'], ['finalizing', 'Exporting model'], ['completed', 'Completed'],
] as const;

export function useGeneration(id: string) {
  return useQuery({
    queryKey: ['generation', id], queryFn: () => http.get<Generation>(`/generations/${id}`),
    refetchInterval: (q) => (q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 2000 : false),
  });
}

function Elapsed({ from, to }: { from: string | null; to: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (to) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [to]);
  if (!from) return <>—</>;
  return <>{formatDuration(((to ? new Date(to).getTime() : now) - new Date(from).getTime()) / 1000)}</>;
}

export default function JobPage() {
  const { id = '' } = useParams();
  const nav = useNavigate(); const inv = useInvalidate();
  const { data: g, isLoading, isError } = useGeneration(id);
  const { data: imgs } = useImages(g?.project_id ?? '');
  const [cancelOpen, setCancelOpen] = useState(false);
  useEffect(() => { if (g && !['queued', 'running'].includes(g.status)) void inv('me', 'dashboard', 'models', 'projects', 'notifications'); }, [g?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isError) return <EmptyState icon={<Box />} title="Job not found" />;
  if (isLoading || !g) return <Skeleton className="h-96" />;

  const active = ['queued', 'running'].includes(g.status);
  const seen = new Set(g.events.map((e) => e.stage));
  const stagesAll = g.mode === 'ai' ? AI_STAGES : PG_STAGES;
  const stages = stagesAll.filter(([k]) => (k === 'rigging' ? g.settings.rig : true));
  const used = new Set(g.used_image_ids);
  const metrics = g.metrics as Record<string, number | string | null>;
  const ModeIcon = g.mode === 'ai' ? Sparkles : ScanLine;

  async function retry() {
    try { const n = await http.post<Generation>(`/generations/${g!.id}/refine`, { settings: {} }); nav(`/app/jobs/${n.id}`); } catch (e) { toast.error(errorMessage(e)); }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <Breadcrumbs items={[{ label: 'Projects', to: '/app/projects' }, { label: g.project_name ?? 'Project', to: `/app/projects/${g.project_id}` }, { label: g.mode === 'ai' ? 'AI Processing' : 'Photogrammetry' }]} />
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{g.status === 'succeeded' ? '3D model generated' : g.status === 'failed' ? 'Generation failed' : g.status === 'cancelled' ? 'Generation cancelled' : 'Generating 3D model'}</h1><StatusBadge status={g.status} />{g.is_demo && <Badge tone="warning">Demo — not from your photos</Badge>}</div>
          <p className="mt-1 text-sm text-ink-muted">{active ? 'This may take a few minutes. You can leave this page — you will be notified when it finishes.' : `Finished ${formatDateTime(g.completed_at)}`}</p>
        </div>
        <Stepper steps={['Upload Images', 'Configure', 'Process', 'Refine & Export']} current={g.status === 'succeeded' ? 3 : 2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr_300px]">
        <section className="surface h-fit p-4" aria-label="Input">
          <div className="flex items-center gap-2 text-[13px] font-semibold"><ModeIcon className="size-4 text-brand" />{g.mode === 'ai' ? `AI Reconstruction · ${titleCase(g.provider)}` : 'Photogrammetry · COLMAP'}</div>
          <p className="mt-1 text-xs text-ink-muted">{g.used_image_ids.length} of {g.input_image_ids.length} images used</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {imgs?.items.filter((i) => g.input_image_ids.includes(i.id)).map((im) => (
              <img key={im.id} src={im.thumb_url} alt={`${ANGLE_LABELS[im.angle]}${used.has(im.id) ? ' (used)' : ' (not used)'}`} title={`${ANGLE_LABELS[im.angle]}${used.has(im.id) ? ' — used' : ' — not used'}`}
                className={cn('aspect-square w-full rounded-md object-cover', used.has(im.id) ? 'ring-2 ring-brand' : 'opacity-40')} />
            ))}
          </div>
          <dl className="mt-4 space-y-1.5 text-xs">
            {Object.entries({ Quality: g.settings.quality, Texture: g.settings.texture_resolution, 'Polygon level': g.settings.polygon_level, Category: g.settings.category }).map(([k, v]) => v && (
              <div key={k} className="flex justify-between"><dt className="text-ink-muted">{k}</dt><dd className="font-medium capitalize">{String(v)}</dd></div>))}
            <div className="flex justify-between"><dt className="text-ink-muted">Credits</dt><dd className="font-medium">{g.credits_charged}</dd></div>
            {g.provider_task_id && <div className="flex justify-between gap-2"><dt className="text-ink-muted">Task ID</dt><dd className="truncate font-mono text-[11px]">{g.provider_task_id}</dd></div>}
          </dl>
        </section>

        <section className="surface p-5" aria-label="Processing stages" aria-live="polite">
          <ol className="space-y-3">
            {stages.map(([k, label], i) => {
              const lastSeen = stages.reduce((acc, [sk], j) => (seen.has(sk) ? j : acc), -1);
              const current = g.stage === k && active;
              const failedHere = !active && g.status !== 'succeeded' && i === lastSeen;
              const done = seen.has(k) && !current && !failedHere;
              const notReported = !seen.has(k) && !active;
              return (
                <li key={k} className="flex items-center gap-3">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', done ? 'bg-success text-white' : current ? 'bg-brand text-white' : failedHere ? 'bg-danger text-white' : 'border border-line bg-surface text-ink-subtle')}>
                    {done ? <Check className="size-4" /> : current ? <Loader2 className="size-4 animate-spin" /> : failedHere ? <X className="size-4" /> : notReported ? <Minus className="size-3.5" /> : <Circle className="size-2.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[13.5px] font-semibold', !done && !current && !failedHere && 'text-ink-muted')}>{label}{notReported && <span className="ml-2 text-xs font-normal text-ink-subtle">not reported</span>}</p>
                    {current && g.progress != null && (<div className="mt-1.5 max-w-sm"><ProgressBar value={g.progress} label={label} /><p className="mt-1 text-[11px] text-ink-muted">{Math.round(g.progress)}% · reported by {g.progress_source}</p></div>)}
                  </div>
                </li>
              );
            })}
          </ol>
          {g.error && <Callout tone="danger" icon={<AlertTriangle />} className="mt-5" title="Error">{g.error}</Callout>}
          <details className="mt-6 rounded-lg border border-line" open={!active}>
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] font-semibold"><ScrollText className="size-4" /> Event log ({g.events.length})</summary>
            <ol className="max-h-72 space-y-1 overflow-y-auto border-t border-line px-3 py-2 font-mono text-[11.5px]">
              {g.events.map((e, i) => (
                <li key={i} className={cn(e.level === 'error' ? 'text-danger' : e.level === 'warning' ? 'text-[#8A5A12]' : 'text-ink-muted')}>
                  <span className="text-ink-subtle">{new Date(e.at).toLocaleTimeString()}</span> [{e.stage}] {e.message}
                </li>
              ))}
            </ol>
          </details>
        </section>

        <aside className="surface h-fit space-y-4 p-5">
          {active ? (
            <div className="grid place-items-center py-2 text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-brand-50"><Loader2 className="size-7 animate-spin text-brand" /></div>
              <p className="mt-3 font-semibold">Processing…</p>
              <p className="text-xs text-ink-muted">Elapsed <Elapsed from={g.started_at ?? g.created_at} to={null} /> · no completion estimate is shown because providers do not report one.</p>
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">Duration <span className="font-semibold text-ink"><Elapsed from={g.started_at ?? g.created_at} to={g.completed_at} /></span></p>
          )}
          {g.mode === 'photogrammetry' && Object.keys(metrics).length > 0 && (
            <dl className="space-y-1.5 rounded-lg bg-canvas p-3 text-xs">
              {[['Registered images', metrics.registered_images != null ? `${metrics.registered_images} / ${metrics.total_images}` : null], ['Sparse points', metrics.sparse_points], ['Mean reprojection error', metrics.mean_reprojection_error != null ? `${Number(metrics.mean_reprojection_error).toFixed(3)} px` : null],
                ['Dense mode', metrics.dense_mode], ['Mesh triangles', metrics.mesh_faces], ['Scale', metrics.scale_source]].filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2"><dt className="text-ink-muted">{k}</dt><dd className="font-semibold">{String(v)}</dd></div>))}
            </dl>
          )}
          {active && <Button variant="secondary" className="w-full" onClick={() => setCancelOpen(true)}>Cancel job</Button>}
          {g.status === 'succeeded' && g.model_id && <Link to={`/app/models/${g.model_id}`} className={cn(buttonVariants(), 'w-full')}><Box /> Open model workspace</Link>}
          {(g.status === 'failed' || g.status === 'cancelled') && <Button className="w-full" onClick={retry}><RotateCcw /> Try again</Button>}
          <Link to={`/app/projects/${g.project_id}`} className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}>Back to project</Link>
        </aside>
      </div>
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this job?" description="Processing stops and the credits for this job are refunded." confirmLabel="Cancel job" danger
        onConfirm={async () => { try { await http.post(`/generations/${g.id}/cancel`); await inv('generation', 'me'); toast.success('Job cancelled'); } catch (e) { toast.error(errorMessage(e)); } }} />
    </div>
  );
}
