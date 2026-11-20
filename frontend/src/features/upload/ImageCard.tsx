import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, AlertTriangle, RefreshCw, Trash2, ChevronLeft, ChevronRight, Maximize2, Copy } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { Dialog } from '@/components/ui/dialog';
import { http, uploadWithProgress, errorMessage } from '@/services/api';
import { ANGLES, type Angle, type ProjectImage } from '@/types/api';
import { ANGLE_LABELS } from './angles';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';

export function ImageCard({ img, onChanged, onMove, index, total, flags, draggable = true, compact }: {
  img: ProjectImage; onChanged: () => void; onMove?: (dir: -1 | 1) => void; index?: number; total?: number;
  flags?: { duplicate?: boolean; outlier?: boolean; weak?: boolean }; draggable?: boolean; compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  const q = img.quality;
  const problems = [...(q?.warnings ?? [])];
  if (flags?.duplicate) problems.push('Near-duplicate of another image');
  if (flags?.outlier) problems.push('Colour distribution differs from the set — same object?');
  if (flags?.weak) problems.push('Few verified feature matches with other images');
  const good = !q?.is_blurry && q?.resolution_ok && q?.exposure === 'ok' && !flags?.duplicate && !flags?.weak;

  async function setAngle(angle: Angle) {
    try { await http.patch(`/uploads/${img.id}`, { angle }); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function replace(f: File) {
    setBusy(true);
    try { const form = new FormData(); form.append('file', f, f.name); await uploadWithProgress(`/uploads/${img.id}/replace`, form); toast.success('Image replaced'); onChanged(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await http.del(`/uploads/${img.id}`); onChanged(); } catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  }

  return (
    <div className={cn('group relative rounded-xl border border-line bg-surface p-1.5 transition-shadow hover:shadow-raised', busy && 'opacity-60')}
      draggable={draggable} onDragStart={(e) => { e.dataTransfer.setData('application/x-vistora-image', img.id); e.dataTransfer.effectAllowed = 'move'; }}>
      <div className="relative aspect-square overflow-hidden rounded-lg bg-canvas">
        <img src={img.thumb_url} alt={`${ANGLE_LABELS[img.angle]} view — ${img.original_name}`} loading="lazy" className="size-full object-cover" draggable={false} />
        <Tooltip content={good ? 'No quality issues detected' : <ul className="space-y-0.5">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}>
          <span className={cn('absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full text-white shadow', good ? 'bg-success' : 'bg-warning')} tabIndex={0} aria-label={good ? 'Quality OK' : `Quality issues: ${problems.join('; ')}`}>
            {good ? <Check className="size-3" /> : <AlertTriangle className="size-3" />}
          </span>
        </Tooltip>
        {flags?.duplicate && <span className="absolute left-1.5 top-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white"><Copy className="mr-0.5 inline size-2.5" />dup</span>}
        <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-surface/95 p-1 text-ink shadow hover:text-brand" aria-label="View full size"><Maximize2 className="size-3.5" /></button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md bg-surface/95 p-1 text-ink shadow hover:text-brand" aria-label="Replace image"><RefreshCw className="size-3.5" /></button>
          <button type="button" onClick={remove} className="rounded-md bg-surface/95 p-1 text-danger shadow" aria-label="Delete image"><Trash2 className="size-3.5" /></button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replace(f); e.target.value = ''; }} />
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        {onMove && <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="rounded p-0.5 text-ink-subtle hover:text-ink disabled:opacity-30" aria-label="Move earlier"><ChevronLeft className="size-3.5" /></button>}
        <select value={img.angle} onChange={(e) => setAngle(e.target.value as Angle)} aria-label={`Angle for ${img.original_name}`}
          className="min-w-0 flex-1 truncate rounded-md border-0 bg-transparent py-0.5 text-center text-[11.5px] font-semibold text-ink hover:bg-canvas focus:shadow-focus focus:outline-none">
          {ANGLES.map((a) => <option key={a} value={a}>{ANGLE_LABELS[a]}</option>)}
        </select>
        {onMove && <button type="button" disabled={index === (total ?? 1) - 1} onClick={() => onMove(1)} className="rounded p-0.5 text-ink-subtle hover:text-ink disabled:opacity-30" aria-label="Move later"><ChevronRight className="size-3.5" /></button>}
      </div>
      {!compact && <p className="truncate px-1 text-[10.5px] text-ink-subtle" title={img.original_name}>{img.width}×{img.height} · {formatBytes(img.size_bytes)}</p>}
      <Dialog open={open} onOpenChange={setOpen} title={img.original_name} className="max-w-4xl">
        <img src={img.url} alt={img.original_name} className="max-h-[60vh] w-full rounded-lg object-contain" />
        {q && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[['Resolution', `${q.width}×${q.height} (${q.megapixels} MP)`], ['Sharpness (Laplacian var.)', `${q.blur_score}${q.is_blurry ? ' — blurry' : ''}`], ['Brightness / contrast', `${q.brightness} / ${q.contrast}`], ['Exposure', q.exposure]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-canvas p-2"><dt className="text-ink-muted">{k}</dt><dd className="font-semibold capitalize">{v}</dd></div>))}
          </dl>
        )}
        {problems.length > 0 && <ul className="mt-3 space-y-1 text-[13px] text-[#8A5A12]">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
      </Dialog>
    </div>
  );
}
