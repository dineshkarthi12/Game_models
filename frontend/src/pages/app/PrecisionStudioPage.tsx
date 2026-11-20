import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, Cpu, Camera, Sun, Layers, Ruler, ArrowRight, ScanLine, AlertTriangle, Check } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, Label } from '@/components/ui/input';
import { PageHeader, Callout, EmptyState, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { CaptureRingIllustration } from '@/components/brand/Illustrations';
import { http } from '@/services/api';
import { useProjects } from '@/hooks/queries';
import type { SystemStatus } from '@/types/api';
import { formatDateTime } from '@/utils/format';

interface ReconRow { id: string; project_id: string; project_name: string; status: string; stage: string | null; created_at: string; model_id: string | null;
  registered_images: number | null; total_images: number | null; mean_reprojection_error: number | null; dense_mode: string | null; scale_source: string | null }

export default function PrecisionStudioPage() {
  const nav = useNavigate();
  const { data: sys } = useQuery({ queryKey: ['system'], queryFn: () => http.get<SystemStatus>('/system/status'), staleTime: 60_000 });
  const { data: recs, isLoading } = useQuery({ queryKey: ['reconstructions'], queryFn: () => http.get<{ items: ReconRow[] }>('/reconstruction'),
    refetchInterval: (q) => (q.state.data?.items.some((r) => ['queued', 'running'].includes(r.status)) ? 3000 : false) });
  const { data: projects } = useProjects({ page_size: 100 });
  const [pid, setPid] = useState('');
  const colmap = sys?.tools.colmap;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Precision Reconstruction Studio" description="Photogrammetry with COLMAP: measured camera poses, dense points and real-world scale."
        actions={<Link to="/app/create?mode=photogrammetry" className={buttonVariants()}><Crosshair /> New precision scan</Link>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="surface grid gap-6 p-5 md:grid-cols-[1fr_220px]">
            <div>
              <h2 className="text-[15px] font-semibold">Start from an existing project</h2>
              <p className="mt-1 text-[13px] text-ink-muted">Choose a project with overlapping photographs. You can review image quality and run the overlap check before reconstructing.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1"><Label htmlFor="pg-proj">Project</Label>
                  <Select id="pg-proj" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Select a project…</option>{projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.image_count} images</option>)}</Select></div>
                <Button disabled={!pid} onClick={() => nav(`/app/projects/${pid}/studio?mode=photogrammetry`)}>Open studio <ArrowRight /></Button>
              </div>
            </div>
            <CaptureRingIllustration className="hidden md:block" />
          </section>

          <section className="surface" aria-labelledby="recs-h">
            <h2 id="recs-h" className="border-b border-line px-5 py-4 text-[15px] font-semibold">Reconstructions</h2>
            {isLoading ? <div className="p-4"><Skeleton className="h-32" /></div> : !recs?.items.length ? (
              <EmptyState className="m-4" icon={<ScanLine />} title="No reconstructions yet" description="Start a precision scan from a project with 20+ overlapping photos." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b border-line text-xs text-ink-muted"><tr>{['Project', 'Registered', 'Reprojection error', 'Dense mode', 'Scale', 'Started', 'Status'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {recs.items.map((r) => (
                      <tr key={r.id} className="hover:bg-canvas/60">
                        <td className="px-4 py-2.5"><Link to={`/app/jobs/${r.id}`} className="font-semibold hover:text-brand-600">{r.project_name}</Link></td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-muted">{r.registered_images != null ? `${r.registered_images} / ${r.total_images}` : '—'}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-muted">{r.mean_reprojection_error != null ? `${r.mean_reprojection_error.toFixed(3)} px` : '—'}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{r.dense_mode === 'cpu_sgbm_fusion' ? 'CPU stereo' : r.dense_mode === 'colmap_patch_match' ? 'GPU PatchMatch' : '—'}</td>
                        <td className="max-w-[180px] truncate px-4 py-2.5 text-ink-muted" title={r.scale_source ?? ''}>{r.scale_source?.startsWith('known') ? 'Calibrated' : r.scale_source ? 'Relative' : '—'}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{formatDateTime(r.created_at)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="surface p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Cpu className="size-4 text-brand" /> Engine status</h2>
            {!sys ? <Skeleton className="mt-3 h-20" /> : (
              <dl className="mt-3 space-y-2 text-[13px]">
                <div className="flex justify-between"><dt className="text-ink-muted">COLMAP</dt><dd className="font-semibold">{colmap?.available ? `v${colmap.version}` : 'Not installed'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">CUDA (dense MVS)</dt><dd className="font-semibold">{colmap?.cuda ? 'Available' : 'Not available'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">Blender (UV / export)</dt><dd className="font-semibold">{sys.tools.blender.available ? `v${sys.tools.blender.version}` : 'Not installed'}</dd></div>
              </dl>
            )}
            {sys && !colmap?.cuda && <Callout tone="info" className="mt-3">Without a CUDA GPU, dense points come from CPU semi-global stereo on rectified photo pairs. Expect lower detail than GPU PatchMatch and longer processing times.</Callout>}
          </section>
          <section className="surface p-5">
            <h2 className="text-[15px] font-semibold">Capture requirements</h2>
            <ul className="mt-3 space-y-3 text-[13px]">
              {[
                [Camera, '20–80 sharp photos', 'Two or three rings around the object, every 10–15°, 60–80% overlap between neighbours.'],
                [Sun, 'Soft, constant light', 'Avoid hard shadows and lighting changes between shots. Lock exposure if possible.'],
                [Layers, 'Textured surfaces', 'Matching needs surface detail. Plain backgrounds are fine; plain objects are not.'],
                [Ruler, 'A known dimension', 'Measure one side of the object to calibrate real-world scale.'],
              ].map(([I, t, d]) => { const Icon = I as typeof Camera; return (
                <li key={t as string} className="flex gap-3"><Icon className="mt-0.5 size-4 shrink-0 text-brand" /><div><p className="font-semibold">{t as string}</p><p className="text-ink-muted">{d as string}</p></div></li>); })}
            </ul>
            <Callout tone="warning" icon={<AlertTriangle />} className="mt-4" title="Reflective, transparent & featureless objects">
              Mirrors, glass, chrome and single-colour plastic do not produce reliable matches. Use cross-polarised or diffuse lighting, a temporary matte spray, or textured markers around the object — or use AI reconstruction, which estimates rather than measures.
            </Callout>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted"><Check className="size-3.5 text-success" /> Unrelated front/side/back photos are not a photogrammetry dataset — the overlap check will tell you.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
