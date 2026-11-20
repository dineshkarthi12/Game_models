import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, Sparkles, ScanLine, Pencil, Trash2, Image as ImageIcon, Layers, History, FolderX } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProjectFormDialog } from '@/components/projects/ProjectFormDialog';
import { ModelCard } from '@/components/models/ModelCard';
import { GenerationRow } from '@/components/GenerationRow';
import { useGenerations, useInvalidate, useModels, useProject } from '@/hooks/queries';
import { useImages, useAnalysis } from '@/features/upload/hooks';
import { ANGLE_LABELS } from '@/features/upload/angles';
import { http, errorMessage } from '@/services/api';
import { CATEGORY_LABELS } from '@/types/api';
import { formatDate } from '@/utils/format';

export default function ProjectDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const inv = useInvalidate();
  const { data: p, isLoading, isError } = useProject(id);
  const { data: imgs } = useImages(id);
  const { data: analysis } = useAnalysis(id);
  const { data: models } = useModels({ project_id: id, page_size: 50 });
  const { data: gens } = useGenerations({ project_id: id, page_size: 50 });
  const [editing, setEditing] = useState(false); const [deleting, setDeleting] = useState(false);

  if (isError) return <EmptyState icon={<FolderX />} title="Project not found" description="It may have been deleted or you may not have access." action={<Link to="/app/projects" className={buttonVariants({ size: 'sm' })}>Back to projects</Link>} />;
  if (isLoading || !p) return <Skeleton className="h-96" />;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Breadcrumbs items={[{ label: 'Projects', to: '/app/projects' }, { label: p.name }]} />
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{p.name}</h1><StatusBadge status={p.status} /></div>
          <p className="mt-1 text-sm text-ink-muted">{CATEGORY_LABELS[p.category]} · created {formatDate(p.created_at)} · {p.image_count} images · {p.model_count} models</p>
          {p.description && <p className="mt-2 max-w-2xl text-sm text-ink">{p.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/app/projects/${id}/studio`} className={buttonVariants({ variant: 'secondary' })}><Upload /> Upload images</Link>
          <Link to={`/app/projects/${id}/studio?step=configure&mode=ai`} className={buttonVariants({ variant: 'secondary' })}><Sparkles /> AI generate</Link>
          <Link to={`/app/projects/${id}/studio?step=configure&mode=photogrammetry`} className={buttonVariants()}><ScanLine /> Photogrammetry</Link>
          <Button variant="ghost" size="icon" aria-label="Edit project" onClick={() => setEditing(true)}><Pencil /></Button>
          <Button variant="danger-ghost" size="icon" aria-label="Delete project" onClick={() => setDeleting(true)}><Trash2 /></Button>
        </div>
      </div>

      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">Models ({models?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="images">Reference images ({imgs?.items.length ?? 0})</TabsTrigger>
          <TabsTrigger value="generations">Generations ({gens?.total ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="models" className="pt-5">
          {models?.items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{models.items.map((m) => <ModelCard key={m.id} model={m} />)}</div>
            : <EmptyState icon={<Layers />} title="No models yet" description="Upload reference images and start a generation to create models in this project." action={<Link to={`/app/projects/${id}/studio`} className={buttonVariants({ size: 'sm' })}>Open studio</Link>} />}
        </TabsContent>
        <TabsContent value="images" className="pt-5">
          {analysis && (
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              <Badge tone="brand">Coverage {Math.round(analysis.coverage_ratio * 100)}% of key views</Badge>
              {analysis.blurry_image_ids.length > 0 && <Badge tone="warning">{analysis.blurry_image_ids.length} blurry</Badge>}
              {analysis.duplicates.length > 0 && <Badge tone="warning">{analysis.duplicates.length} duplicate pairs</Badge>}
              {analysis.overlap && <Badge tone={analysis.overlap.suitable_for_photogrammetry ? 'success' : 'warning'}>Overlap {analysis.overlap.suitable_for_photogrammetry ? 'sufficient' : 'insufficient'}</Badge>}
            </div>
          )}
          {imgs?.items.length ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {imgs.items.map((im) => (
                <figure key={im.id} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <img src={im.thumb_url} alt={`${ANGLE_LABELS[im.angle]} — ${im.original_name}`} loading="lazy" className="aspect-square w-full object-cover" />
                  <figcaption className="truncate px-2 py-1 text-[11px] font-semibold">{ANGLE_LABELS[im.angle]}</figcaption>
                </figure>
              ))}
            </div>
          ) : <EmptyState icon={<ImageIcon />} title="No reference images" action={<Link to={`/app/projects/${id}/studio`} className={buttonVariants({ size: 'sm' })}>Upload images</Link>} />}
        </TabsContent>
        <TabsContent value="generations" className="pt-5">
          {gens?.items.length ? <div className="surface p-2">{gens.items.map((g) => <GenerationRow key={g.id} g={g} />)}</div>
            : <EmptyState icon={<History />} title="No generations yet" />}
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={editing} onOpenChange={setEditing} project={p} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} danger confirmLabel="Delete project" title={`Delete “${p.name}”?`}
        description="All images, generations, models and exports in this project will be permanently deleted."
        onConfirm={async () => { try { await http.del(`/projects/${id}`); await inv('projects', 'dashboard', 'models', 'me'); toast.success('Project deleted'); nav('/app/projects'); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
    </div>
  );
}
