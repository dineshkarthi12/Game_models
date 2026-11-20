import * as M from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export const DropdownMenu = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn('z-50 min-w-[180px] rounded-xl border border-line bg-surface p-1.5 shadow-raised animate-fade-in', className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function DropdownItem({ children, onSelect, danger, disabled, icon }: { children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode }) {
  return (
    <M.Item onSelect={onSelect} disabled={disabled}
      className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 [&_svg]:size-4',
        danger ? 'text-danger data-[highlighted]:bg-danger-50' : 'text-ink data-[highlighted]:bg-canvas')}>
      {icon}{children}
    </M.Item>
  );
}

export function DropdownSeparator() { return <M.Separator className="my-1 h-px bg-line" />; }
export function DropdownLabel({ children }: { children: ReactNode }) { return <M.Label className="px-2.5 py-1.5 text-xs font-semibold text-ink-muted">{children}</M.Label>; }
