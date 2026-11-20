import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const badge = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-canvas text-ink-muted border border-line',
      brand: 'bg-brand-50 text-brand-600',
      blue: 'bg-accent-50 text-accent-600',
      success: 'bg-success-50 text-success',
      warning: 'bg-warning-50 text-[#B4761A]',
      danger: 'bg-danger-50 text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}

const statusTone: Record<string, VariantProps<typeof badge>['tone']> = {
  completed: 'success', succeeded: 'success', ready: 'success', passed: 'success', active: 'success',
  processing: 'blue', running: 'blue', in_progress: 'blue', queued: 'brand', pending: 'brand', uploading: 'blue',
  failed: 'danger', error: 'danger', cancelled: 'neutral', canceled: 'neutral', draft: 'neutral',
  warning: 'warning', configuration_required: 'warning', demo: 'warning',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = statusTone[status] ?? 'neutral';
  const label = status.replace(/_/g, ' ');
  return (
    <Badge tone={tone} className={cn('capitalize', className)}>
      {['processing', 'running', 'in_progress', 'uploading'].includes(status) && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {label}
    </Badge>
  );
}
