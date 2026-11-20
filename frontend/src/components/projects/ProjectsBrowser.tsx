import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, LayoutList, LayoutGrid, MoreHorizontal, Pencil, Trash2, Upload, FolderOpen, ArrowUpDown, FolderKanban, Plus, FileJson } from 'lucide-react';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProjectFormDialog } from './ProjectFormDialog';
import { Thumb } from './ProjectThumb';
import { useProjects, useInvalidate } from '@/hooks/queries';
import { http, errorMessage } from '@/services/api';
import { ASSET_CATEGORIES, CATEGORY_LABELS, type Project } from '@/types/api';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';

export function ProjectsBrowser({ pageSize = 12, compact = false, title }: { pageSize?: number; compact?: boolean; title?: string }) {
  const nav = useNavigate();
  const inv = useInvalidate();
  const [q, setQ] = useState(''); const [category, setCategory] = useState(''); const [status, setStatus] = useState('');
  const [sort, setSort] = useState('updated'); const [order, setOrder] = useState<'asc' | 'desc'>('desc'); const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [editing, setEditing] = useState<Project | null>(null); const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const { data, isLoading, isError, refetch } = useProjects({ q, category, status, sort, order, page, page_size: pageSize });
  const reset = () => setPage(1);

  const actions = (p: Project) => (
    <DropdownMenu>
      <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}><MoreHorizontal /></Button></DropdownTrigger>
      <DropdownContent>
        <DropdownItem icon={<FolderOpen />} onSelect={() => nav(`/app/projects/${p.id}`)}>Open</DropdownItem>
        <DropdownItem icon={<Upload />} onSelect={() => nav(`/app/projects/${p.id}/studio`)}>Upload images</DropdownItem>
        <DropdownItem icon={<Pencil />} onSelect={() => setEditing(p)}>Edit details</DropdownItem>
        <DropdownItem icon={<FileJson />} onSelect={async () => {
          try {
            const m = await http.get(`/projects/${p.id}/manifest`);
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' }));
            a.download = `${p.name.replace(/[^\w.-]+/g, '_')}_manifest.json`; a.click(); URL.revokeObjectURL(a.href);
          } catch (e) { toast.error(errorMessage(e)); }
        }}>Export project manifest</DropdownItem>
        <DropdownSeparator />
        <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleting(p)}>Delete</DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );

  return (
    <section className="surface">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
        {title && <h2 className="mr-auto text-[15px] font-semibold">{title}</h2>}
        <div className={cn('relative', title ? 'lg:w-56' : 'flex-1')}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search projects…" aria-label="Search projects" className="h-9 pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filter by type" className="h-9 w-40" value={category} onChange={(e) => { setCategory(e.target.value); reset(); }}>
            <option value="">All types</option>{ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
          <Select aria-label="Filter by status" className="h-9 w-36" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
            <option value="">All status</option><option value="draft">Draft</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="failed">Failed</option>
          </Select>
          {!compact && (
            <Select aria-label="Sort" className="h-9 w-40" value={`${sort}:${order}`} onChange={(e) => { const [s, o] = e.target.value.split(':'); setSort(s); setOrder(o as 'asc' | 'desc'); }}>
              <option value="updated:desc">Recently updated</option><option value="created:desc">Newest first</option><option value="created:asc">Oldest first</option><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option>
            </Select>
          )}
          <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="View">
            <Button variant="ghost" size="icon-sm" className={cn(view === 'list' && 'bg-brand-50 text-brand')} aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><LayoutList /></Button>
            <Button variant="ghost" size="icon-sm" className={cn(view === 'grid' && 'bg-brand-50 text-brand')} aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><LayoutGrid /></Button>
          </div>
        </div>
      </div>

      <div className="p-4 pt-2">
        {isError ? (
          <div className="py-10 text-center text-sm text-danger">Projects could not be loaded. <button className="font-semibold underline" onClick={() => refetch()}>Retry</button></div>
        ) : isLoading ? (
          <div className="space-y-2 pt-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState className="mt-2" icon={<FolderKanban />} title={q || category || status ? 'No matching projects' : 'No projects yet'}
            description={q || category || status ? 'Try a different search or filter.' : 'Create a project, upload multi-view photos and generate your first model.'}
            action={!(q || category || status) && <Button size="sm" onClick={() => setCreating(true)}><Plus /> New project</Button>} />
        ) : view === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-line">
                  <th className="py-2.5 pl-1 font-semibold">Project</th>
                  <th className="py-2.5 font-semibold">Type</th>
                  <th className="py-2.5 font-semibold">Images</th>
                  <th className="py-2.5 font-semibold"><button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => { setSort('created'); setOrder(order === 'desc' ? 'asc' : 'desc'); }}>Created <ArrowUpDown className="size-3" /></button></th>
                  <th className="py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 pr-1 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((p) => (
                  <tr key={p.id} className="group hover:bg-canvas/60">
                    <td className="py-2.5 pl-1">
                      <Link to={`/app/projects/${p.id}`} className="flex items-center gap-3 font-semibold text-ink hover:text-brand-600">
                        <Thumb src={p.cover_url} alt="" className="size-10" />{p.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-ink-muted">{CATEGORY_LABELS[p.category]}</td>
                    <td className="py-2.5 tabular-nums text-ink-muted">{p.image_count}</td>
                    <td className="py-2.5 text-ink-muted">{formatDate(p.created_at)}</td>
                    <td className="py-2.5"><StatusBadge status={p.status} /></td>
                    <td className="py-2.5 pr-1 text-right">{actions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-raised">
                <Link to={`/app/projects/${p.id}`} className="block"><Thumb src={p.cover_url} alt="" className="aspect-[4/3] w-full rounded-none border-0" iconClassName="size-8" /></Link>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <Link to={`/app/projects/${p.id}`} className="block truncate text-sm font-semibold hover:text-brand-600">{p.name}</Link>
                    <p className="mt-0.5 text-xs text-ink-muted">{CATEGORY_LABELS[p.category]} · {p.image_count} images · {p.model_count} models</p>
                    <StatusBadge status={p.status} className="mt-2" />
                  </div>
                  {actions(p)}
                </div>
              </div>
            ))}
          </div>
        )}
        {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
      </div>

      <ProjectFormDialog open={creating} onOpenChange={setCreating} navigateTo={(p) => `/app/projects/${p.id}/studio`} />
      <ProjectFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} project={editing} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} danger confirmLabel="Delete project" title={`Delete “${deleting?.name}”?`}
        description="All reference images, generations, models and exports in this project will be permanently deleted. This cannot be undone."
        onConfirm={async () => { try { await http.del(`/projects/${deleting!.id}`); toast.success('Project deleted'); await inv('projects', 'dashboard', 'models', 'me'); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
    </section>
  );
}
