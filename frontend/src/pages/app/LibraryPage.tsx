import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, LayoutGrid, LayoutList, Folder, FolderPlus, Star, Library, Trash2, Tag, Download, ExternalLink } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/input';
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/Pagination';
import { ModelCard, SourceBadge, FavoriteButton } from '@/components/models/ModelCard';
import { ModelActions, downloadModel } from '@/components/models/ModelActions';
import { Thumb } from '@/components/projects/ProjectThumb';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useModels, useFolders, useTags, useInvalidate } from '@/hooks/queries';
import { useUIStore } from '@/stores/ui';
import { http, errorMessage } from '@/services/api';
import { ASSET_CATEGORIES, CATEGORY_LABELS, type Model } from '@/types/api';
import { formatBytes, formatDate, formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const view = useUIStore((s) => s.libraryView); const setView = useUIStore((s) => s.setLibraryView);
  const inv = useInvalidate();
  const [q, setQ] = useState(params.get('q') ?? '');
  useEffect(() => { setQ(params.get('q') ?? ''); }, [params]);
  const folder = params.get('folder') ?? ''; const favorite = params.get('favorite') ?? ''; const tag = params.get('tag') ?? '';
  const [category, setCategory] = useState(''); const [source, setSource] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [sort, setSort] = useState('created:desc'); const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Model | null>(null);
  const [newFolder, setNewFolder] = useState(false); const [folderName, setFolderName] = useState('');
  const [deleteFolder, setDeleteFolder] = useState<{ id: string; name: string } | null>(null);
  const [s, o] = sort.split(':');
  const { data, isLoading, isError } = useModels({ q, category, source, folder_id: folder, favorite, tag, from, to, sort: s, order: o, page, page_size: 24 });
  const { data: folders } = useFolders(); const { data: tags } = useTags();
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n); setPage(1); };
  const filtered = !!(q || category || source || folder || favorite || tag || from || to);

  const sideItem = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string, count?: number) => (
    <button onClick={onClick} className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium', active ? 'bg-brand-50 text-brand-600' : 'text-ink-muted hover:bg-canvas hover:text-ink')}>
      {icon}<span className="flex-1 truncate">{label}</span>{count != null && <span className="text-xs tabular-nums">{count}</span>}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Asset Library" description="Every generated and refined model across your projects." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-5">
          <div className="space-y-0.5">
            {sideItem(!folder && !favorite, () => { const n = new URLSearchParams(params); n.delete('folder'); n.delete('favorite'); setParams(n); }, <Library className="size-4" />, 'All assets')}
            {sideItem(favorite === 'true', () => setParam('favorite', favorite ? '' : 'true'), <Star className="size-4" />, 'Favorites')}
            {sideItem(folder === 'none', () => setParam('folder', 'none'), <Folder className="size-4" />, 'Unfiled')}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between px-2.5"><p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Folders</p>
              <Button variant="ghost" size="icon-sm" aria-label="New folder" onClick={() => { setFolderName(''); setNewFolder(true); }}><FolderPlus /></Button></div>
            <div className="space-y-0.5">
              {folders?.items.map((f) => (
                <div key={f.id} className="group flex items-center">
                  {sideItem(folder === f.id, () => setParam('folder', f.id), <Folder className="size-4" />, f.name, f.model_count)}
                  <button className="ml-1 hidden rounded p-1 text-ink-subtle hover:text-danger group-hover:block" aria-label={`Delete folder ${f.name}`} onClick={() => setDeleteFolder(f)}><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              {!folders?.items.length && <p className="px-2.5 text-xs text-ink-subtle">No folders yet</p>}
            </div>
          </div>
          {!!tags?.items.length && (
            <div><p className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">Tags</p>
              <div className="flex flex-wrap gap-1.5 px-2.5">{tags.items.map((t) => (
                <button key={t.tag} onClick={() => setParam('tag', tag === t.tag ? '' : t.tag)} className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', tag === t.tag ? 'border-brand bg-brand-50 text-brand-600' : 'border-line text-ink-muted hover:border-line-strong')}>
                  #{t.tag} <span className="text-ink-subtle">{t.count}</span></button>))}</div></div>
          )}
        </aside>

        <section className="min-w-0">
          <div className="surface mb-4 flex flex-col gap-2 p-3 xl:flex-row xl:items-center">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
              <Input aria-label="Search assets" className="h-9 pl-9" placeholder="Search by name, project or tag…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Category" className="h-9 w-36" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</Select>
              <Select aria-label="Source" className="h-9 w-36" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}><option value="">All sources</option><option value="ai">AI</option><option value="photogrammetry">Photogrammetry</option><option value="upload">Upload</option></Select>
              <label className="flex items-center gap-1 text-xs text-ink-muted">From<Input type="date" aria-label="Created from" className="h-9 w-[140px]" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
              <label className="flex items-center gap-1 text-xs text-ink-muted">To<Input type="date" aria-label="Created to" className="h-9 w-[140px]" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
              <Select aria-label="Sort" className="h-9 w-36" value={sort} onChange={(e) => setSort(e.target.value)}><option value="created:desc">Newest</option><option value="created:asc">Oldest</option><option value="updated:desc">Recently edited</option><option value="name:asc">Name A–Z</option></Select>
              <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="View">
                <Button variant="ghost" size="icon-sm" className={cn(view === 'grid' && 'bg-brand-50 text-brand')} aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><LayoutGrid /></Button>
                <Button variant="ghost" size="icon-sm" className={cn(view === 'list' && 'bg-brand-50 text-brand')} aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><LayoutList /></Button>
              </div>
            </div>
          </div>
          {tag && <div className="mb-3 flex items-center gap-2 text-sm"><Tag className="size-4 text-brand" />Tagged <Badge tone="brand">#{tag}</Badge><button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setParam('tag', '')}>Clear</button></div>}

          {isError ? <p className="py-10 text-center text-sm text-danger">The library could not be loaded.</p>
            : isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
            : !data?.items.length ? (
              <EmptyState icon={<Library />} title={filtered ? 'No assets match these filters' : 'Your library is empty'}
                description={filtered ? 'Adjust the search or filters.' : 'Models appear here after a generation or reconstruction finishes.'}
                action={!filtered && <Link to="/app/create" className={buttonVariants({ size: 'sm' })}>Create a model</Link>} />
            ) : view === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{data.items.map((m) => <ModelCard key={m.id} model={m} onPreview={() => setPreview(m)} />)}</div>
            ) : (
              <div className="surface overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b border-line text-xs text-ink-muted"><tr><th className="p-3 font-semibold">Model</th><th className="p-3 font-semibold">Source</th><th className="p-3 font-semibold">Project</th><th className="p-3 font-semibold">Triangles</th><th className="p-3 font-semibold">Created</th><th className="p-3" /></tr></thead>
                  <tbody className="divide-y divide-line">{data.items.map((m) => (
                    <tr key={m.id} className="hover:bg-canvas/60">
                      <td className="p-3"><div className="flex items-center gap-3"><Thumb src={m.thumbnail_url} alt="" className="size-10" /><Link to={`/app/models/${m.id}`} className="font-semibold hover:text-brand-600">{m.name}</Link><FavoriteButton model={m} /></div></td>
                      <td className="p-3"><SourceBadge model={m} /></td>
                      <td className="p-3 text-ink-muted">{m.project_name}</td>
                      <td className="p-3 tabular-nums text-ink-muted">{m.stats ? formatNumber(m.stats.triangles) : '—'}</td>
                      <td className="p-3 text-ink-muted">{formatDate(m.created_at)}</td>
                      <td className="p-3 text-right"><ModelActions model={m} onPreview={() => setPreview(m)} /></td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          {data && <Pagination page={page} pageSize={24} total={data.total} onPage={setPage} />}
        </section>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={preview?.name ?? ''} className="max-w-2xl">
        {preview && (
          <div className="grid gap-5 sm:grid-cols-[1fr_1fr]">
            <Thumb src={preview.thumbnail_url} alt={`${preview.name} thumbnail`} className="aspect-square w-full" iconClassName="size-12" />
            <div className="space-y-3 text-[13px]">
              <div className="flex flex-wrap gap-1.5"><SourceBadge model={preview} />{preview.game_ready && <Badge tone="success">Game-ready</Badge>}</div>
              <dl className="divide-y divide-line rounded-lg border border-line">
                {[['Project', preview.project_name], ['Category', CATEGORY_LABELS[preview.category]], ['Version', preview.current_version ? `v${preview.current_version}` : '—'],
                  ['Vertices', preview.stats ? formatNumber(preview.stats.vertices) : '—'], ['Triangles', preview.stats ? formatNumber(preview.stats.triangles) : '—'],
                  ['Materials', preview.stats?.materials ?? '—'], ['File size', preview.stats ? formatBytes(preview.stats.file_size) : '—'], ['Created', formatDate(preview.created_at)]].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between px-3 py-1.5"><dt className="text-ink-muted">{k}</dt><dd className="font-medium">{v}</dd></div>))}
              </dl>
              <div className="flex gap-2">
                <Link to={`/app/models/${preview.id}`} className={buttonVariants({ size: 'sm' })}><ExternalLink /> Open workspace</Link>
                <Button size="sm" variant="secondary" disabled={preview.status !== 'ready'} onClick={() => downloadModel(preview)}><Download /> GLB</Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={newFolder} onOpenChange={setNewFolder} title="New folder"
        footer={<><Button variant="secondary" onClick={() => setNewFolder(false)}>Cancel</Button><Button disabled={!folderName.trim()} onClick={async () => {
          try { await http.post('/folders', { name: folderName.trim() }); await inv('folders'); setNewFolder(false); toast.success('Folder created'); } catch (e) { toast.error(errorMessage(e)); }
        }}>Create</Button></>}>
        <Label htmlFor="folder-name">Folder name</Label><Input id="folder-name" value={folderName} maxLength={80} onChange={(e) => setFolderName(e.target.value)} />
      </Dialog>
      <ConfirmDialog open={!!deleteFolder} onOpenChange={(o) => !o && setDeleteFolder(null)} danger title={`Delete folder “${deleteFolder?.name}”?`} confirmLabel="Delete folder"
        description="Models in this folder are kept and become unfiled."
        onConfirm={async () => { await http.del(`/folders/${deleteFolder!.id}`); if (folder === deleteFolder!.id) setParam('folder', ''); await inv('folders', 'models'); }} />
    </div>
  );
}
