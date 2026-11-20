import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {it.to ? <Link to={it.to} className="hover:text-ink">{it.label}</Link> : <span className="font-semibold text-ink" aria-current="page">{it.label}</span>}
            {i < items.length - 1 && <ChevronRight className="size-3.5" aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
