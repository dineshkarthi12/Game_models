import type { ReactNode, HTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand', className)} aria-label={label} role="status" />;
}

export function Skeleton({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-lg bg-line/70', className)} {...p} />;
}

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-xl bg-brand-50 text-brand [&_svg]:size-6">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Progress bar — only render with a value that comes from a real measurement. */
export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Callout({ tone = 'info', title, children, className, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; className?: string; icon?: ReactNode }) {
  const tones = {
    info: 'border-accent-100 bg-accent-50 text-[#1F4FA8]',
    warning: 'border-warning/30 bg-warning-50 text-[#8A5A12]',
    danger: 'border-danger/25 bg-danger-50 text-[#9B2C2C]',
    success: 'border-success/25 bg-success-50 text-[#0F6B47]',
  } as const;
  return (
    <div className={cn('flex gap-3 rounded-lg border px-4 py-3 text-[13px]', tones[tone], className)} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <div className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</div>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'leading-relaxed')}>{children}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, ariaLabel, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]; className?: string; ariaLabel?: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex flex-wrap gap-1 rounded-lg border border-line bg-canvas p-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled} title={o.title}
          onClick={() => onChange(o.value)}
          className={cn('rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:bg-surface hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ icon, label, value, hint, className }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('surface flex items-start gap-3 p-4', className)}>
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand [&_svg]:size-5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{value}</p>
        {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
      </div>
    </div>
  );
}
