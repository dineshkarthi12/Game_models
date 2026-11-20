import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ExportForm } from '@/features/export/ExportForm';
import type { Model } from '@/types/api';

export function ExportActions({ model }: { model: Model }) {
  const [open, setOpen] = useState(false); const nav = useNavigate();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={model.status !== 'ready'}><Download /> Export Model</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Export Model" description="Choose a target application and export format." className="max-w-3xl">
        <ExportForm modelId={model.id} onStarted={(j) => { setOpen(false); nav(`/app/exports?highlight=${j.id}`); }} />
      </Dialog>
    </>
  );
}
