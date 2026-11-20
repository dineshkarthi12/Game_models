import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UploadCloud, Camera, FolderOpen, X, CheckCircle2, XCircle, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar, Skeleton, Callout } from '@/components/ui/misc';
import { http, errorMessage } from '@/services/api';
import type { Angle, ProjectImage } from '@/types/api';
import { useAnalysis, useImages, useUploader, MAX_UPLOAD_MB } from './hooks';
import { AngleSlots, AddMoreTile } from './AngleSlots';
import { ImageCard } from './ImageCard';
import { CoveragePanel } from './CoveragePanel';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';

export function UploadStudio({ projectId, mode, footer }: { projectId: string; mode: 'ai' | 'photogrammetry'; footer?: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: imgData, isLoading } = useImages(projectId);
  const { data: analysis, isLoading: aLoading, refetch } = useAnalysis(projectId);
  const { upload, queue, progress, clearQueue, refresh } = useUploader(projectId);
  const [drag, setDrag] = useState(false);
  const [activeAngle, setActiveAngle] = useState<Angle | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const browseRef = useRef<HTMLInputElement>(null); const cameraRef = useRef<HTMLInputElement>(null);
  const images = useMemo(() => imgData?.items ?? [], [imgData]);

  const flagsFor = useMemo(() => {
    const dup = new Set(analysis?.duplicates.flatMap((d) => [d.a, d.b]) ?? []);
    const out = new Set(analysis?.similarity.outlier_image_ids ?? []);
    const weak = new Set(analysis?.overlap?.weakly_connected_image_ids ?? []);
    return (id: string) => ({ duplicate: dup.has(id), outlier: out.has(id), weak: weak.has(id) });
  }, [analysis]);

  async function reorder(ids: string[]) {
    qc.setQueryData(['images', projectId], { items: ids.map((id) => images.find((i) => i.id === id)!).filter(Boolean) });
    try { await http.put(`/projects/${projectId}/images/order`, { ids }); } catch (e) { toast.error(errorMessage(e)); }
    await refresh();
  }
  const move = (i: number, dir: -1 | 1) => { const ids = images.map((x) => x.id); const j = i + dir; [ids[i], ids[j]] = [ids[j]!, ids[i]!]; void reorder(ids); };
  const dropOn = (targetId: string, e: React.DragEvent) => {
    const id = e.dataTransfer.getData('application/x-vistora-image'); setDragOverId(null);
    if (!id || id === targetId) return;
    e.preventDefault(); e.stopPropagation();
    const ids = images.map((x) => x.id).filter((x) => x !== id); ids.splice(ids.indexOf(targetId), 0, id); void reorder(ids);
  };
  const onFiles = (files: File[], angle?: Angle) => { void upload(files, files.map(() => angle)); };
  const uploading = progress !== null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDrag(false); onFiles([...e.dataTransfer.files]); }}
          className={cn('rounded-xl border-2 border-dashed bg-surface p-6 text-center transition-colors', drag ? 'border-brand bg-brand-50/50' : 'border-line-strong')}>
          <UploadCloud className="mx-auto size-8 text-brand" aria-hidden />
          <h2 className="mt-2 text-[15px] font-semibold">Upload multi-view images</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Drag photos of the same object here. JPG, PNG or WEBP up to {MAX_UPLOAD_MB} MB each.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={() => browseRef.current?.click()} disabled={uploading}><FolderOpen /> Browse files</Button>
            <Button variant="secondary" onClick={() => cameraRef.current?.click()} disabled={uploading}><Camera /> Take photo</Button>
            <a href="/docs#capture" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2 text-[13px] font-semibold text-brand-600 hover:underline"><BookOpen className="size-4" /> Angle guide</a>
          </div>
          <input ref={browseRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Browse image files" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Capture with camera" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
          {uploading && <div className="mx-auto mt-5 max-w-sm"><ProgressBar value={progress ?? 0} label="Upload progress" /><p className="mt-1 text-xs text-ink-muted">Uploading and analysing… {Math.round(progress ?? 0)}%</p></div>}
        </div>

        {queue.length > 0 && (
          <div className="surface p-3">
            <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold">Upload activity</p><button onClick={clearQueue} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Clear upload activity"><X className="size-4" /></button></div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs" aria-live="polite">
              {queue.map((q) => (
                <li key={q.key} className="flex items-center gap-2">
                  {q.status === 'uploading' ? <Loader2 className="size-3.5 animate-spin text-brand" /> : q.status === 'done' ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-danger" />}
                  <span className="truncate font-medium">{q.name}</span><span className="text-ink-subtle">{formatBytes(q.size)}</span>
                  {q.reason && <span className="truncate text-danger">— {q.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <section aria-labelledby="key-views-h">
          <div className="mb-3 flex items-end justify-between">
            <div><h2 id="key-views-h" className="text-[15px] font-semibold">Key views</h2><p className="text-xs text-ink-muted">Drop a photo on a slot to assign its angle, or drag an uploaded image onto another slot.</p></div>
          </div>
          {isLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
            : <AngleSlots images={images} onUpload={onFiles} onChanged={refresh} activeAngle={activeAngle} flags={flagsFor} />}
        </section>

        <section aria-labelledby="all-h">
          <div className="mb-3 flex items-end justify-between">
            <div><h2 id="all-h" className="text-[15px] font-semibold">All photographs <span className="text-ink-muted">({images.length})</span></h2>
              <p className="text-xs text-ink-muted">Order matters for sequential capture. Drag to reorder or use the arrows.</p></div>
          </div>
          {mode === 'photogrammetry' && images.length > 0 && images.length < 20 && <Callout tone="info" className="mb-3">Photogrammetry usually needs 20+ overlapping photos. You can still start with fewer, but registration may fail.</Callout>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {images.map((img: ProjectImage, i) => (
              <div key={img.id} onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-vistora-image')) { e.preventDefault(); setDragOverId(img.id); } }}
                onDragLeave={() => setDragOverId(null)} onDrop={(e) => dropOn(img.id, e)} className={cn('rounded-xl', dragOverId === img.id && 'ring-2 ring-brand')}>
                <ImageCard img={img} index={i} total={images.length} onChanged={refresh} onMove={(d) => move(i, d)} flags={flagsFor(img.id)} />
              </div>
            ))}
            <AddMoreTile onFiles={(f) => onFiles(f)} />
          </div>
        </section>
        {footer}
      </div>
      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <CoveragePanel projectId={projectId} analysis={analysis} loading={aLoading} onRefresh={() => void refetch()} activeAngle={activeAngle}
          onSelectAngle={(a) => setActiveAngle(activeAngle === a ? null : a)} mode={mode} />
      </aside>
    </div>
  );
}
