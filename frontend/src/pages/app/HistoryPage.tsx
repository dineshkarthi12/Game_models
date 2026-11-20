import { useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Search } from 'lucide-react';
import { Input, Select } from '@/components/ui/input';
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/misc';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/Pagination';
import { useGenerations } from '@/hooks/queries';
import { formatDateTime, formatDuration, titleCase } from '@/utils/format';

export default function HistoryPage() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [mode, setMode] = useState(''); const [page, setPage] = useState(1);
  const { data, isLoading } = useGenerations({ q, status, mode, page, page_size: 20 });
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Generation History" description="Every AI generation and photogrammetry reconstruction, with its real outcome." />
      <div className="surface">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" /><Input aria-label="Search generations" className="h-9 pl-9" placeholder="Search by project or provider…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select aria-label="Mode" className="h-9 sm:w-44" value={mode} onChange={(e) => { setMode(e.target.value); setPage(1); }}><option value="">All modes</option><option value="ai">AI Reconstruction</option><option value="photogrammetry">Photogrammetry</option></Select>
          <Select aria-label="Status" className="h-9 sm:w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All status</option>{['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        </div>
        {isLoading ? <div className="p-4"><Skeleton className="h-48" /></div> : !data?.items.length ? (
          <EmptyState className="m-4" icon={<History />} title="No generations found" description="Start one from Create 3D." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-line text-xs text-ink-muted"><tr>{['Project', 'Mode', 'Provider', 'Images used', 'Started', 'Duration', 'Credits', 'Status'].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((g) => {
                  const dur = g.started_at && g.completed_at ? (new Date(g.completed_at).getTime() - new Date(g.started_at).getTime()) / 1000 : null;
                  return (
                    <tr key={g.id} className="hover:bg-canvas/60">
                      <td className="p-3"><Link to={`/app/jobs/${g.id}`} className="font-semibold hover:text-brand-600">{g.project_name}</Link></td>
                      <td className="p-3 text-ink-muted">{g.mode === 'ai' ? 'AI' : 'Photogrammetry'}</td>
                      <td className="p-3 text-ink-muted">{titleCase(g.provider)} {g.is_demo && <Badge tone="warning" className="ml-1">Demo</Badge>}</td>
                      <td className="p-3 tabular-nums text-ink-muted">{g.used_image_ids.length || '—'} / {g.input_image_ids.length}</td>
                      <td className="p-3 text-ink-muted">{formatDateTime(g.started_at ?? g.created_at)}</td>
                      <td className="p-3 tabular-nums text-ink-muted">{formatDuration(dur)}</td>
                      <td className="p-3 tabular-nums text-ink-muted">{g.credits_charged}</td>
                      <td className="p-3"><StatusBadge status={g.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="px-3 pb-3"><Pagination page={page} pageSize={20} total={data.total} onPage={setPage} /></div>}
      </div>
    </div>
  );
}
