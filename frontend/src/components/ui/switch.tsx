import * as S from '@radix-ui/react-switch';
import { cn } from '@/utils/cn';

export function Switch({ checked, onCheckedChange, disabled, label, id, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: string; id?: string; className?: string }) {
  return (
    <S.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
      className={cn('relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-brand disabled:opacity-40', className)}>
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}
