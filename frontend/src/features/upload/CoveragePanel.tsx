import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Minus, AlertTriangle, Lightbulb, Network, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout, Skeleton } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { http, errorMessage } from '@/services/api';
import type { Angle, DatasetAnalysis } from '@/types/api';
import { ANGLE_LABELS } from './angles';
import { OrientationGuide } from './OrientationGuide';
import { relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

function Ring({ value }: { value: number }) {
  const r = 34; const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-24" role="img" aria-label={`Reference coverage ${Math.round(value * 100)} percent of key angles`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="#E7EAF2" strokeWidth="7" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={value >= 0.6 ? '#16A36A' : value >= 0.3 ? '#E9A23B' : '#DC5555'} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle" fontSize="15" fontWeight="700" fill="#18213B">{Math.round(value * 100)}%</text>
    </svg>
  );
}

export function CoveragePanel({ projectId, analysis, loading, onRefresh, activeAngle, onSelectAngle, mode }: {
  projectId: string; analysis?: DatasetAnalysis; loading: boolean; onRefresh: () => void; activeAngle?: Angle | null; onSelectAngle?: (a: Angle) => void; mode: 'ai' | 'photogrammetry';
}) {
  const [checking, setChecking] = useState(false);
  if (loading || !analysis) return <div className="surface space-y-3 p-4"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;
  const covered = new Set(analysis.coverage.filter((c) => c.present).map((c) => c.angle));
  const present = analysis.coverage.filter((c) => c.present).length;
  const issues: string[] = [];
  if (analysis.blurry_image_ids.length) issues.push(`${analysis.blurry_image_ids.length} blurry`);
  if (analysis.low_resolution_image_ids.length) issues.push(`${analysis.low_resolution_image_ids.length} low-resolution`);
  if (analysis.duplicates.length) issues.push(`${analysis.duplicates.length} duplicate pair(s)`);
  if (!analysis.lighting.consistent) issues.push('inconsistent lighting');
  if (analysis.similarity.outlier_image_ids.length) issues.push(`${analysis.similarity.outlier_image_ids.length} colour outlier(s)`);
  const ov = analysis.overlap;

  async function checkOverlap() {
    setChecking(true);
    try { await http.post(`/projects/${projectId}/analysis/overlap`); onRefresh(); toast.success('Overlap analysis complete'); }
    catch (e) { toast.error(errorMessage(e)); } finally { setChecking(false); }
  }

  return (
    <div className="space-y-4">
      <section className="surface p-4" aria-labelledby="cov-h">
        <div className="flex items-center justify-between">
          <h2 id="cov-h" className="text-[15px] font-semibold">Reference Coverage</h2>
          <Tooltip content="Which of the 10 canonical camera angles have at least one photo. This is not a measure of reconstruction accuracy."><Info className="size-4 text-ink-subtle" /></Tooltip>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <Ring value={analysis.coverage_ratio} />
          <div className="text-[13px]">
            <p className="font-semibold">{present}/10 key views</p>
            <p className="text-ink-muted">{analysis.image_count} image{analysis.image_count === 1 ? '' : 's'} uploaded</p>
            <p className="mt-1 text-xs text-ink-subtle">Coverage ≠ accuracy</p>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
          {analysis.coverage.map((c) => (
            <li key={c.angle}>
              <button type="button" onClick={() => onSelectAngle?.(c.angle)} className={cn('flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-canvas', activeAngle === c.angle && 'bg-brand-50')}>
                <span className={c.present ? 'text-ink' : 'text-ink-muted'}>{ANGLE_LABELS[c.angle]}</span>
                {c.present ? <Check className="size-4 text-success" aria-label="covered" /> : <Minus className="size-4 text-ink-subtle" aria-label="missing" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="surface p-4">
        <h2 className="mb-2 text-[15px] font-semibold">Orientation guide</h2>
        <OrientationGuide covered={covered} active={activeAngle} onSelect={onSelectAngle} />
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="text-[15px] font-semibold">Image quality</h2>
        {issues.length ? <Callout tone="warning" icon={<AlertTriangle />}>Found: {issues.join(', ')}.</Callout>
          : analysis.image_count ? <Callout tone="success" icon={<Check />}>No blur, resolution, duplicate or lighting issues detected.</Callout> : null}
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-muted">Mean brightness</dt><dd className="font-semibold">{analysis.lighting.mean_brightness} / 255</dd></div>
          <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-muted">Brightness spread</dt><dd className="font-semibold">σ {analysis.lighting.stddev_brightness}</dd></div>
        </dl>
        <p className="text-[11px] leading-relaxed text-ink-subtle">{analysis.similarity.note}</p>
      </section>

      <section className="surface space-y-3 p-4">
        <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Overlap check</h2>
          <Button size="sm" variant={mode === 'photogrammetry' ? 'primary' : 'secondary'} loading={checking} disabled={analysis.image_count < 2} onClick={checkOverlap}><Network /> {ov ? 'Re-run' : 'Run'}</Button></div>
        <p className="text-xs text-ink-muted">Matches ORB features between image pairs and verifies them with RANSAC — a measured indicator of whether the set can register in photogrammetry.</p>
        {ov && (
          <div className="space-y-2 text-[13px]">
            <Callout tone={ov.suitable_for_photogrammetry ? 'success' : 'warning'} icon={ov.suitable_for_photogrammetry ? <Check /> : <AlertTriangle />}>
              {ov.suitable_for_photogrammetry ? 'Every image has at least two well-matched neighbours.' : `${ov.weakly_connected_image_ids.length} image(s) have fewer than two strongly matched neighbours.`}
            </Callout>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-muted">Pairs checked</dt><dd className="font-semibold">{ov.pairs_checked}</dd></div>
              <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-muted">Mean inliers</dt><dd className="font-semibold">{ov.mean_inlier_matches}</dd></div>
            </dl>
            <p className="text-[11px] text-ink-subtle">Computed {relativeTime(ov.computed_at)} · {ov.method}</p>
          </div>
        )}
      </section>

      {!!analysis.recommendations.length && (
        <section className="surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Lightbulb className="size-4 text-warning" /> Recommendations</h2>
          <ul className="space-y-1.5 text-[13px] text-ink-muted">{analysis.recommendations.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-ink-subtle" />{r}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
