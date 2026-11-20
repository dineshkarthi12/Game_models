import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Thumb } from '@/components/projects/ProjectThumb';
import { ModelActions } from './ModelActions';
import { useUpdateModel } from '@/hooks/queries';
import { CATEGORY_LABELS, type Model } from '@/types/api';
import { formatNumber, relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

export function SourceBadge({ model }: { model: Pick<Model, 'source' | 'is_demo' | 'provider'> }) {
  if (model.is_demo) return <Badge tone="warning">Demo</Badge>;
  if (model.source === 'photogrammetry') return <Badge tone="blue">Photogrammetry</Badge>;
  if (model.source === 'ai') return <Badge tone="brand">AI · {model.provider}</Badge>;
  return <Badge>Upload</Badge>;
}

export function FavoriteButton({ model, className }: { model: Model; className?: string }) {
  const update = useUpdateModel();
  return (
    <button onClick={() => update.mutate({ id: model.id, favorite: !model.favorite })} aria-pressed={model.favorite} aria-label={model.favorite ? 'Remove from favorites' : 'Add to favorites'}
      className={cn('rounded-md p-1.5 transition-colors hover:bg-canvas', model.favorite ? 'text-warning' : 'text-ink-subtle', className)}>
      <Star className={cn('size-4', model.favorite && 'fill-current')} />
    </button>
  );
}

export function ModelCard({ model, onPreview }: { model: Model; onPreview?: () => void }) {
  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-raised">
      <div className="relative">
        <Link to={`/app/models/${model.id}`} className="block"><Thumb src={model.thumbnail_url} alt="" className="aspect-square w-full rounded-none border-0" iconClassName="size-10" /></Link>
        <div className="absolute left-2 top-2 flex gap-1"><SourceBadge model={model} /></div>
        <FavoriteButton model={model} className="absolute right-2 top-2 bg-surface/90" />
      </div>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <Link to={`/app/models/${model.id}`} className="block truncate text-sm font-semibold hover:text-brand-600">{model.name}</Link>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{CATEGORY_LABELS[model.category]} · {model.stats ? `${formatNumber(model.stats.triangles)} tris` : '—'} · {relativeTime(model.created_at)}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {model.status !== 'ready' && <StatusBadge status={model.status} />}
            {model.game_ready && <Badge tone="success">Game-ready</Badge>}
            {model.tags.slice(0, 3).map((t) => <Badge key={t}>#{t}</Badge>)}
          </div>
        </div>
        <ModelActions model={model} onPreview={onPreview} />
      </div>
    </div>
  );
}
