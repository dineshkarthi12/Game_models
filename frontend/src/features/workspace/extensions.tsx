import { Link } from 'react-router-dom';
import { ShieldCheck, Wand2, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import type { Model } from '@/types/api';
import type { SceneInfo } from '@/viewer/inspect';
import type { ModelMetadata } from './hooks';
import { ValidationPanel } from './ValidationPanel';
import { cn } from '@/utils/cn';
import { ExportActions } from './exportActions';

/** Extension points filled by later milestones (validation, refinement, optimisation, export). */
export const ExtraTabs: { id: string; label: string; icon: LucideIcon; mode: string }[] = [
  { id: 'validation', label: 'Validation', icon: ShieldCheck, mode: 'shaded' },
];

export function WorkspaceActions({ model }: { model: Model }) {
  const disabled = model.status !== 'ready';
  return (
    <div className="flex flex-wrap gap-2">
      <Link to={`/app/models/${model.id}/refine`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), disabled && 'pointer-events-none opacity-50')}><Wand2 /> Refine Model</Link>
      <ExportActions model={model} />
    </div>
  );
}

export function extraTabContent(t: string, ctx: { model: Model; meta: ModelMetadata; info: SceneInfo | null; onChanged: () => void }): React.ReactNode | null {
  if (t === 'validation') return <ValidationPanel modelId={ctx.model.id} versionId={ctx.meta.version?.id ?? null} isDemo={ctx.model.is_demo} />;
  return null;
}
