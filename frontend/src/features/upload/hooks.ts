import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http, uploadWithProgress, errorMessage } from '@/services/api';
import type { Angle, DatasetAnalysis, ProjectImage } from '@/types/api';

export const MAX_UPLOAD_MB = 40;
export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function useImages(projectId: string) {
  return useQuery({ queryKey: ['images', projectId], queryFn: () => http.get<{ items: ProjectImage[] }>(`/projects/${projectId}/images`), enabled: !!projectId });
}
export function useAnalysis(projectId: string) {
  return useQuery({ queryKey: ['analysis', projectId], queryFn: () => http.get<DatasetAnalysis>(`/projects/${projectId}/analysis`), enabled: !!projectId });
}

export interface QueueItem { key: string; name: string; size: number; status: 'uploading' | 'done' | 'rejected'; reason?: string }

/** Client-side checks first (type, size, same-batch duplicates), then upload with real byte progress. */
export function useUploader(projectId: string) {
  const qc = useQueryClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['images', projectId] }), qc.invalidateQueries({ queryKey: ['analysis', projectId] }),
      qc.invalidateQueries({ queryKey: ['project', projectId] }), qc.invalidateQueries({ queryKey: ['me'] }), qc.invalidateQueries({ queryKey: ['projects'] })]);
  }, [qc, projectId]);

  const upload = useCallback(async (files: File[], angles?: (Angle | undefined)[]) => {
    const seen = new Set<string>(); const ok: File[] = []; const okAngles: string[] = []; const items: QueueItem[] = [];
    files.forEach((f, i) => {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      const base: QueueItem = { key: key + Math.random(), name: f.name, size: f.size, status: 'uploading' };
      if (!ACCEPTED.includes(f.type)) items.push({ ...base, status: 'rejected', reason: 'Unsupported type — use JPG, PNG or WEBP' });
      else if (f.size > MAX_UPLOAD_MB * 1024 * 1024) items.push({ ...base, status: 'rejected', reason: `Larger than ${MAX_UPLOAD_MB} MB` });
      else if (seen.has(key)) items.push({ ...base, status: 'rejected', reason: 'Selected twice in this batch' });
      else { seen.add(key); ok.push(f); okAngles.push(angles?.[i] ?? 'custom'); items.push(base); }
    });
    setQueue((q) => [...items, ...q].slice(0, 60));
    if (!ok.length) return;
    // Upload in batches of 8 so progress stays responsive and requests stay small.
    const total = ok.reduce((s, f) => s + f.size, 0); let sent = 0;
    setProgress(0);
    try {
      for (let i = 0; i < ok.length; i += 8) {
        const batch = ok.slice(i, i + 8); const batchAngles = okAngles.slice(i, i + 8);
        const batchSize = batch.reduce((s, f) => s + f.size, 0);
        const form = new FormData();
        form.append('project_id', projectId);
        form.append('angles', JSON.stringify(batchAngles));
        batch.forEach((f) => form.append('files', f, f.name));
        try {
          const r = await uploadWithProgress<{ items: ProjectImage[]; rejected: { name: string; reason: string }[] }>('/uploads', form, (p) => setProgress(((sent + (batchSize * p) / 100) / total) * 100));
          const rejected = new Map(r.rejected.map((x) => [x.name, x.reason]));
          setQueue((q) => q.map((it) => (batch.some((f) => f.name === it.name) && it.status === 'uploading'
            ? (rejected.has(it.name) ? { ...it, status: 'rejected', reason: rejected.get(it.name) } : { ...it, status: 'done' }) : it)));
        } catch (e) {
          const msg = errorMessage(e);
          setQueue((q) => q.map((it) => (batch.some((f) => f.name === it.name) && it.status === 'uploading' ? { ...it, status: 'rejected', reason: msg } : it)));
          toast.error(msg);
        }
        sent += batchSize;
        await refresh();
      }
    } finally { setProgress(null); }
  }, [projectId, refresh]);

  return { upload, queue, progress, clearQueue: () => setQueue([]), refresh };
}
