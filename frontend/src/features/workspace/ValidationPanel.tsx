import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, Check, X, AlertTriangle, Minus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Callout, Skeleton } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { http, errorMessage } from '@/services/api';
import type { ProcessingJob, ValidationReport } from '@/types/api';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { Section } from './Panels';

const ICON = { pass: Check, warn: AlertTriangle, fail: X, not_applicable: Minus, not_available: Minus } as const;
const TONE = { pass: 'bg-success text-white', warn: 'bg-warning text-white', fail: 'bg-danger text-white', not_applicable: 'bg-line text-ink-muted', not_available: 'bg-line text-ink-muted' } as const;

export function useJobPoll(jobId: string | null, onDone: (j: ProcessingJob) => void) {
  const { data } = useQuery({
    queryKey: ['processing-job', jobId], enabled: !!jobId, queryFn: () => http.get<ProcessingJob>(`/processing-jobs/${jobId}`),
    refetchInterval: (q) => (q.state.data && ['succeeded', 'failed'].includes(q.state.data.status) ? false : 1500),
  });
  useEffect(() => { if (data && ['succeeded', 'failed'].includes(data.status)) onDone(data); }, [data?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

export function ValidationPanel({ modelId, versionId, isDemo }: { modelId: string; versionId: string | null; isDemo: boolean }) {
  const qc = useQueryClient();
  const key = ['quality-report', modelId, versionId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => http.get<{ report: (ValidationReport & { measurements?: Record<string, number | string> | null }) | null }>(`/models/${modelId}/quality-report${versionId ? `?version_id=${versionId}` : ''}`) });
  const [m, setM] = useState({ width: '', height: '', depth: '', unit: 'cm' });
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPoll(jobId, (j) => {
    setJobId(null);
    if (j.status === 'succeeded') { void qc.invalidateQueries({ queryKey: key }); toast.success('Validation complete'); } else toast.error(j.error ?? 'Validation failed');
  });
  async function run() {
    const measurements: Record<string, number | string> = { unit: m.unit };
    for (const k of ['width', 'height', 'depth'] as const) if (m[k]) measurements[k] = Number(m[k]);
    try { const j = await http.post<ProcessingJob>(`/models/${modelId}/validate`, { version_id: versionId ?? undefined, measurements: Object.keys(measurements).length > 1 ? measurements : undefined }); setJobId(j.id); }
    catch (e) { toast.error(errorMessage(e)); }
  }
  const r = data?.report;
  const groups = r ? [...new Set(r.checks.map((c) => c.group))] : [];
  const pct = (v: number | null | undefined) => (v == null ? 'Not available' : `${(v * 100).toFixed(v < 0.1 ? 2 : 0)}%`);

  return (
    <>
      <Section title="Accuracy validation">
        {isDemo && <Callout tone="warning" className="mb-3">Demo model — validation results are not meaningful for accuracy.</Callout>}
        <p className="mb-2 text-xs text-ink-muted">Optional: enter real measurements of the object to check dimensions.</p>
        <div className="grid grid-cols-4 gap-1.5">
          {(['width', 'height', 'depth'] as const).map((k) => <Input key={k} aria-label={`Measured ${k}`} placeholder={k[0]!.toUpperCase() + k.slice(1)} type="number" min={0} step="any" className="h-8 px-2 text-xs" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} />)}
          <Select aria-label="Unit" className="h-8 px-2 py-0 text-xs" value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value })}><option>mm</option><option>cm</option><option>m</option><option>in</option></Select>
        </div>
        <Button className="mt-3 w-full" size="sm" onClick={run} loading={!!jobId}><ShieldCheck /> {jobId ? (job?.status === 'running' ? 'Validating…' : 'Queued…') : r ? 'Re-run validation' : 'Run validation'}</Button>
      </Section>
      {isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !r ? (
        <div className="p-4 text-[13px] text-ink-muted">No report for this version yet.</div>
      ) : (
        <>
          <Section title="Summary">
            <dl className="space-y-1.5 text-[12.5px]">
              {[['Reference Coverage', r.metrics.reference_coverage == null ? 'Not available' : `${Math.round(r.metrics.reference_coverage * 100)}% of key views`, 'Which canonical angles have a photo — not an accuracy measure.'],
                ['Reconstruction Confidence', r.metrics.reconstruction_confidence ?? 'Not available', 'From registered cameras and reprojection error (photogrammetry only).'],
                ['Geometric Deviation', r.metrics.geometric_deviation == null ? 'Not available — no measurements' : `max ${pct(r.metrics.geometric_deviation)}`, 'Largest difference between the model and your measurements.'],
                ['Texture Quality', r.metrics.texture_quality ?? '—', 'Texture maps present and their resolution.'],
                ['Model Integrity', r.metrics.model_integrity ?? '—', 'Topology measured on the mesh.']].map(([k, v, tip]) => (
                <div key={k} className="rounded-lg bg-canvas px-3 py-2">
                  <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{k}<Tooltip content={tip}><Info className="size-3" /></Tooltip></dt>
                  <dd className="mt-0.5 font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 flex gap-3 text-xs"><span className="text-success">{r.summary.pass} pass</span><span className="text-[#B4761A]">{r.summary.warn} warning</span><span className="text-danger">{r.summary.fail} fail</span><span className="text-ink-muted">{r.summary.not_available} n/a</span></p>
            <p className="mt-1 text-[11px] text-ink-subtle">Report from {formatDateTime(r.created_at)}</p>
          </Section>
          {groups.map((g) => (
            <Section key={g} title={g}>
              <ul className="space-y-2.5">
                {r.checks.filter((c) => c.group === g).map((c) => { const I = ICON[c.status]; return (
                  <li key={c.id} className="text-[12.5px]">
                    <div className="flex items-center gap-2">
                      <span className={cn('grid size-4 shrink-0 place-items-center rounded-full', TONE[c.status])}><I className="size-2.5" /></span>
                      <span className="flex-1 font-semibold">{c.label}</span><span className="font-semibold tabular-nums">{c.value ?? '—'}</span>
                    </div>
                    <p className="ml-6 mt-0.5 text-[11.5px] text-ink-muted">{c.detail}</p>
                    <p className="ml-6 text-[10.5px] text-ink-subtle">Method: {c.method}</p>
                  </li>); })}
              </ul>
            </Section>
          ))}
          {r.limitations.length > 0 && <Section title="Limitations"><ul className="space-y-1 text-[11.5px] text-ink-muted">{r.limitations.map((l) => <li key={l}>• {l}</li>)}</ul></Section>}
        </>
      )}
    </>
  );
}
