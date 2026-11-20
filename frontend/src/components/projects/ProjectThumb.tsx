import { Box } from 'lucide-react';
import { cn } from '@/utils/cn';
export function Thumb({ src, alt, className, iconClassName }: { src: string | null | undefined; alt: string; className?: string; iconClassName?: string }) {
  return (
    <div className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-lavender', className)}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" /> : <Box className={cn('size-5 text-brand-300', iconClassName)} aria-hidden />}
    </div>
  );
}
