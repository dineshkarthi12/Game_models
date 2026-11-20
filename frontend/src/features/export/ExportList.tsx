import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Trash2, Check, X, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { http, errorMessage } from '@/services/api';
import type { ExportJob, Paginated } from '@/types/api';
import { formatBytes, formatDateTime, titleCase } from '@/utils/format';
import { cn } from '@/utils/cn';

export async function downloadExport(id: string) {
  try {
    const { url } = await http.get<{ url: string }>(`/exports/${id}/download`);
    const a = document.createElement('a'); a.href = url; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast.error(errorMessage(e)); }
}

export function ExportList({ modelId, highlight }: { modelId?: string; highlight?: string | null }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['exports', modelId ?? 'all'], queryFn: () => http.get<Paginated<ExportJob & { stage: string | null }>>(`/exports?page_size=50${modelId ? `&model_id=${modelId}` : ''}`),
    refetchInterval: (q) => (q.state.data?.items.some((e) => ['queued', 'running'].includes(e.status)) ? 2000 : false),
  });
  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.items.length) return <EmptyState icon={<Package />} title="No exports yet" description="Exports you create appear here with validated download packages." />;
  return (
    <ul className="space-y-3">
      {data.items.map((e) => (
        <li key={e.id} className={cn('surface p-4', highlight === e.id && 'ring-2 ring-brand')}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold">{e.model_name}</p><StatusBadge status={e.status} />
            <span className="text-xs text-ink-muted">{titleCase(e.preset)} · {e.formats.map((f) => f.toUpperCase()).join(', ')} · {formatDateTime(e.created_at)}</span>
            <div className="ml-auto flex gap-1">
              {e.status === 'succeeded' && <Button size="sm" onClick={() => downloadExport(e.id)}><Download /> Download {e.package_size ? `(${formatBytes(e.package_size)})` : ''}</Button>}
              <Button size="icon-sm" variant="ghost" aria-label="Delete export" onClick={async () => { await http.del(`/exports/${e.id}`); await qc.invalidateQueries({ queryKey: ['exports'] }); }}><Trash2 /></Button>
            </div>
          </div>
          {['queued', 'running'].includes(e.status) && <p className="mt-2 text-xs text-ink-muted">Stage: {titleCase(e.stage ?? 'queued')}</p>}
          {e.error && <p className="mt-2 text-xs text-danger">{e.error}</p>}
          {e.files.length > 0 && (
            <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
              {e.files.map((f) => (
                <li key={f.name} className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-xs">
                  <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-white', f.validated ? 'bg-success' : 'bg-danger')}>{f.validated ? <Check className="size-2.5" /> : <X className="size-2.5" />}</span>
                  <div className="min-w-0"><p className="truncate font-semibold">{f.name} <span className="font-normal text-ink-muted">· {formatBytes(f.size)}</span></p><p className="text-ink-muted">{f.validation}</p></div>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
