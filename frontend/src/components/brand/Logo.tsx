import { cn } from '@/utils/cn';

/**
 * Vistora 3D mark: a faceted "V" built from two receding planes and a darker inner
 * facet, reading as a depth cut through space — the moment a flat view becomes volume.
 */
export function LogoMark({ className, title = 'Vistora 3D' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={cn('h-8 w-auto', className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id="vl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8E6EF8" /><stop offset="1" stopColor="#6844F5" /></linearGradient>
        <linearGradient id="vr" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4C8DFF" /><stop offset="1" stopColor="#5B6CF9" /></linearGradient>
      </defs>
      <path d="M1 3h11.5L24 31.5V39z" fill="url(#vl)" />
      <path d="M47 3H35.5L24 31.5V39z" fill="url(#vr)" />
      <path d="M12.5 3 24 31.5 35.5 3h-6.2L24 16.6 18.7 3z" fill="#2C1A6E" opacity=".88" />
      <path d="M18.7 3 24 16.6 29.3 3z" fill="#B39FFC" opacity=".55" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="h-7" />
      {!compact && <span className="text-[19px] font-bold tracking-tight text-ink">Vistora <span className="text-brand">3D</span></span>}
    </span>
  );
}
