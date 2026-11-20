import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus, ImagePlus } from 'lucide-react';
import { http, errorMessage } from '@/services/api';
import type { Angle, ProjectImage } from '@/types/api';
import { ANGLE_LABELS, KEY_ANGLES } from './angles';
import { ImageCard } from './ImageCard';
import { cn } from '@/utils/cn';

/** One slot per canonical angle. Drop a file to upload with that angle, or drop an existing image to reassign it. */
export function AngleSlots({ images, onUpload, onChanged, activeAngle, flags }: {
  images: ProjectImage[]; onUpload: (files: File[], angle: Angle) => void; onChanged: () => void; activeAngle?: Angle | null;
  flags: (id: string) => { duplicate?: boolean; outlier?: boolean; weak?: boolean };
}) {
  const [over, setOver] = useState<Angle | null>(null);
  const inputs = useRef<Partial<Record<Angle, HTMLInputElement | null>>>({});
  const custom = images.filter((i) => i.angle === 'custom');

  async function drop(e: React.DragEvent, angle: Angle) {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData('application/x-vistora-image');
    if (id) { try { await http.patch(`/uploads/${id}`, { angle }); onChanged(); } catch (err) { toast.error(errorMessage(err)); } return; }
    const files = [...e.dataTransfer.files]; if (files.length) onUpload(files, angle);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {KEY_ANGLES.map((angle) => {
          const first = images.find((i) => i.angle === angle);
          const extra = images.filter((i) => i.angle === angle).length - 1;
          return (
            <div key={angle} onDragOver={(e) => { e.preventDefault(); setOver(angle); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, angle)}
              className={cn('relative rounded-xl transition-shadow', over === angle && 'ring-2 ring-brand', activeAngle === angle && 'ring-2 ring-brand-300')}>
              {first ? (
                <>
                  <ImageCard img={first} onChanged={onChanged} flags={flags(first.id)} compact />
                  {extra > 0 && <span className="absolute left-3 top-3 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">+{extra}</span>}
                </>
              ) : (
                <button type="button" onClick={() => inputs.current[angle]?.click()}
                  className="flex aspect-[1/1.12] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-canvas/60 text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600">
                  <ImagePlus className="size-5" /><span className="text-[12px] font-semibold">{ANGLE_LABELS[angle]}</span><span className="text-[10.5px]">Drop or click</span>
                </button>
              )}
              <input ref={(el) => { inputs.current[angle] = el; }} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden"
                aria-label={`Upload ${ANGLE_LABELS[angle]} image`} onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) onUpload(f, angle); e.target.value = ''; }} />
            </div>
          );
        })}
      </div>
      {custom.length > 0 && <p className="mt-3 text-xs text-ink-muted">{custom.length} image{custom.length === 1 ? '' : 's'} with custom angles — see “All photographs” below.</p>}
    </div>
  );
}

export function AddMoreTile({ onFiles }: { onFiles: (f: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 text-brand-600 hover:bg-brand-50">
        <Plus className="size-5" /><span className="text-[12px] font-semibold">Add more</span>
      </button>
      <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Add more images" onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) onFiles(f); e.target.value = ''; }} />
    </>
  );
}
