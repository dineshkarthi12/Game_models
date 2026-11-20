import { useParams, useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Stepper } from '@/components/Stepper';
import { Skeleton, EmptyState } from '@/components/ui/misc';
import { UploadStudio } from '@/features/upload/UploadStudio';
import { ConfigureStep } from '@/features/generate/ConfigureStep';
import { useProject } from '@/hooks/queries';
import { useImages } from '@/features/upload/hooks';
import { FolderX } from 'lucide-react';

export default function ProjectStudioPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'photogrammetry' ? 'photogrammetry' : 'ai';
  const step = params.get('step') === 'configure' ? 1 : 0;
  const { data: project, isLoading, isError } = useProject(id);
  const { data: imgs } = useImages(id);
  const go = (s: number) => { const n = new URLSearchParams(params); if (s === 1) n.set('step', 'configure'); else n.delete('step'); setParams(n); window.scrollTo({ top: 0 }); };

  if (isError) return <EmptyState icon={<FolderX />} title="Project not found" description="It may have been deleted or you may not have access." />;
  return (
    <div className="mx-auto max-w-[1500px]">
      <Breadcrumbs items={[{ label: 'Projects', to: '/app/projects' }, { label: project?.name ?? '…', to: `/app/projects/${id}` }, { label: 'Create 3D' }]} />
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-60" /> : project?.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">Upload reference images, choose a reconstruction mode and generate your 3D model.</p>
        </div>
        <Stepper steps={['Upload Images', 'Configure', 'Process', 'Refine & Export']} current={step} onStep={go} />
      </div>
      {step === 0 ? (
        <UploadStudio projectId={id} mode={mode} footer={
          <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
            <p className="text-xs text-ink-muted">{imgs?.items.length ?? 0} image(s) ready</p>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50" disabled={!imgs?.items.length} onClick={() => go(1)}>Continue →</button>
          </div>} />
      ) : project ? (
        <ConfigureStep project={project} initialMode={mode} onBack={() => go(0)} />
      ) : <Skeleton className="h-96" />}
    </div>
  );
}
