import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
export function Stepper({ steps, current, onStep }: { steps: string[]; current: number; onStep?: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-[13px] font-semibold" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current; const active = i === current;
        const inner = (
          <>
            <span className={cn('grid size-6 place-items-center rounded-full text-xs', active ? 'bg-brand text-white' : done ? 'bg-brand-100 text-brand-700' : 'border border-line bg-surface text-ink-muted')}>{done ? <Check className="size-3.5" /> : i + 1}</span>
            <span className={active ? 'text-brand-600' : done ? 'text-ink' : 'text-ink-muted'}>{s}</span>
          </>
        );
        return (
          <li key={s} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            {onStep && done ? <button type="button" onClick={() => onStep(i)} className="flex items-center gap-2 hover:opacity-80">{inner}</button> : <span className="flex items-center gap-2">{inner}</span>}
            {i < steps.length - 1 && <span className="mx-1 hidden h-px w-8 bg-line sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
