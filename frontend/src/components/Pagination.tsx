import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className="mt-4 text-xs text-ink-muted">{total} item{total === 1 ? '' : 's'}</p> : null;
  const from = (page - 1) * pageSize + 1; const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-xs text-ink-muted">Showing {from}–{to} of {total}</p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <span className="px-2 text-xs font-semibold tabular-nums">{page} / {pages}</span>
        <Button variant="secondary" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </nav>
  );
}
