import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type LabelHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

const field = 'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-shadow focus:border-brand-400 focus:shadow-focus focus:outline-none disabled:bg-canvas disabled:text-ink-muted aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, 'h-10', className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-[88px] py-2', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(field, 'h-10 appearance-none pr-9', className)} {...p}>{children}</select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
  </div>
));
Select.displayName = 'Select';

export function Label({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('label mb-1.5 block', className)} {...p} />;
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{children}</p>;
}

export function Checkbox({ className, label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink', className)}>
      <input type="checkbox" className="size-4 rounded border-line-strong accent-brand" {...p} />
      {label}
    </label>
  );
}
