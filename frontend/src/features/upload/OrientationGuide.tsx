import { Camera } from 'lucide-react';
import type { Angle } from '@/types/api';
import { AZIMUTH, ANGLE_LABELS } from './angles';
import { cn } from '@/utils/cn';

/**
 * Top-down orientation guide: the object sits in the centre, each canonical camera position is placed
 * on a ring by azimuth. Filled cameras have at least one image assigned. Top/bottom are shown as chips.
 */
export function OrientationGuide({ covered, onSelect, active }: { covered: Set<Angle>; onSelect?: (a: Angle) => void; active?: Angle | null }) {
  const R = 38;
  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="#D3C7FE" strokeDasharray="2 2.5" />
          <rect x="40" y="40" width="20" height="20" rx="3" fill="#F4F1FE" stroke="#B39FFC" />
          <path d="M44 56 L50 44 L56 56 Z" fill="#8E6EF8" opacity=".55" />
          <text x="50" y="69" textAnchor="middle" fontSize="4.2" fill="#69738A" fontWeight="600">OBJECT</text>
          <path d="M50 92 L50 97" stroke="#6844F5" strokeWidth="0.8" />
          <text x="50" y="99.5" textAnchor="middle" fontSize="3.4" fill="#6844F5" fontWeight="700">FRONT</text>
        </svg>
        {(Object.entries(AZIMUTH) as [Angle, number][]).map(([a, deg]) => {
          const rad = (deg * Math.PI) / 180;
          const x = 50 + Math.sin(rad) * R; const y = 50 + Math.cos(rad) * R;
          const on = covered.has(a);
          return (
            <button key={a} type="button" onClick={() => onSelect?.(a)} title={`${ANGLE_LABELS[a]}${on ? ' — covered' : ' — missing'}`}
              aria-label={`${ANGLE_LABELS[a]} ${on ? 'covered' : 'missing'}`} aria-pressed={active === a}
              className={cn('absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border transition-colors',
                on ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface text-ink-subtle hover:border-brand-300', active === a && 'ring-2 ring-brand-300')}
              style={{ left: `${x}%`, top: `${y}%` }}>
              <Camera className="size-3.5" style={{ transform: `rotate(${180 - deg}deg)` }} />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-center gap-2">
        {(['top', 'bottom'] as Angle[]).map((a) => (
          <button key={a} type="button" onClick={() => onSelect?.(a)} aria-label={`${ANGLE_LABELS[a]} ${covered.has(a) ? 'covered' : 'missing'}`}
            className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', covered.has(a) ? 'border-brand bg-brand text-white' : 'border-line-strong text-ink-muted')}>
            {ANGLE_LABELS[a]}
          </button>
        ))}
      </div>
    </div>
  );
}
