import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Label, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { useModels } from '@/hooks/queries';
import { ExportForm } from '@/features/export/ExportForm';
import { ExportList } from '@/features/export/ExportList';

export default function ExportCenterPage() {
  const [params] = useSearchParams();
  const [modelId, setModelId] = useState(params.get('model') ?? '');
  const { data: models } = useModels({ page_size: 100, sort: 'updated' });
  const ready = models?.items.filter((m) => m.status === 'ready') ?? [];
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Export Center" description="Export validated packages for Blender, Maya, Unreal Engine, Unity, Godot or any glTF/USD/OBJ/STL tool." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="surface h-fit p-5">
          <h2 className="mb-4 text-[15px] font-semibold">New export</h2>
          <div className="mb-5"><Label htmlFor="ec-model">Model</Label>
            <Select id="ec-model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
              <option value="">Select a model…</option>{ready.map((m) => <option key={m.id} value={m.id}>{m.name}{m.is_demo ? ' (demo)' : ''} · v{m.current_version}</option>)}
            </Select></div>
          {modelId ? <ExportForm key={modelId} modelId={modelId} /> : <p className="text-sm text-ink-muted">Choose a model to configure its export.</p>}
        </section>
        <section><h2 className="mb-3 text-[15px] font-semibold">Exports</h2><ExportList highlight={params.get('highlight')} /></section>
      </div>
    </div>
  );
}
