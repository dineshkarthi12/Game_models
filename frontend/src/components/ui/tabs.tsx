import * as T from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export const Tabs = T.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <T.List className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>{children}</T.List>;
}
export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <T.Trigger value={value} className={cn('-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink data-[state=active]:border-brand data-[state=active]:text-brand-600', className)}>
      {children}
    </T.Trigger>
  );
}
export const TabsContent = T.Content;
