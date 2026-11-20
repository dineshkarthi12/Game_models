import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', danger, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<unknown> | void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={async () => { setLoading(true); try { await onConfirm(); onOpenChange(false); } finally { setLoading(false); } }}>{confirmLabel}</Button>
      </>} />
  );
}
