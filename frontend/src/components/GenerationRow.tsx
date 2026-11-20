import { Link } from 'react-router-dom';
import { Sparkles, ScanLine } from 'lucide-react';
import { StatusBadge, Badge } from '@/components/ui/badge';
import type { Generation } from '@/types/api';
import { relativeTime, titleCase } from '@/utils/format';

export function GenerationRow({ g }: { g: Generation }) {
  const Icon = g.mode === 'ai' ? Sparkles : ScanLine;
  return (
    <Link to={`/app/jobs/${g.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{g.project_name ?? 'Project'}</p>
        <p className="truncate text-xs text-ink-muted">{g.mode === 'ai' ? 'AI Reconstruction' : 'Photogrammetry'} · {titleCase(g.provider)} · {relativeTime(g.created_at)}</p>
      </div>
      {g.is_demo && <Badge tone="warning">Demo</Badge>}
      <StatusBadge status={g.status} />
    </Link>
  );
}
