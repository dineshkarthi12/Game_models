import { RotateCcw, Maximize, Minimize, Grid3x3, Sun, Camera, RefreshCcw, ScanEye } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem, DropdownLabel } from '@/components/ui/dropdown';
import { useViewer, type ViewDir } from '@/viewer/store';
import { cn } from '@/utils/cn';

const btn = 'grid size-8 place-items-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink data-[on=true]:bg-brand-50 data-[on=true]:text-brand';

export function ViewerToolbar({ onFullscreen, fullscreen, onScreenshot }: { onFullscreen: () => void; fullscreen: boolean; onScreenshot: () => void }) {
  const v = useViewer();
  return (
    <>
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-line bg-surface/95 p-1 shadow-card backdrop-blur" role="toolbar" aria-label="Viewer tools">
        <Tooltip content="Reset view"><button className={btn} onClick={() => v.requestView('iso')} aria-label="Reset view"><RotateCcw className="size-4" /></button></Tooltip>
        <Tooltip content="Grid"><button className={btn} data-on={v.grid} onClick={() => v.set({ grid: !v.grid })} aria-pressed={v.grid} aria-label="Toggle grid"><Grid3x3 className="size-4" /></button></Tooltip>
        <DropdownMenu>
          <Tooltip content="Lighting & background"><DropdownTrigger className={btn} aria-label="Lighting and background"><Sun className="size-4" /></DropdownTrigger></Tooltip>
          <DropdownContent align="start">
            <DropdownLabel>Lighting</DropdownLabel>
            {(['studio', 'soft', 'dramatic'] as const).map((l) => <DropdownItem key={l} onSelect={() => v.set({ lighting: l })}>{v.lighting === l ? '● ' : ''}{l[0]!.toUpperCase() + l.slice(1)}</DropdownItem>)}
            <DropdownLabel>Background</DropdownLabel>
            {(['light', 'white', 'dark'] as const).map((b) => <DropdownItem key={b} onSelect={() => v.set({ background: b })}>{v.background === b ? '● ' : ''}{b[0]!.toUpperCase() + b.slice(1)}</DropdownItem>)}
          </DropdownContent>
        </DropdownMenu>
        <Tooltip content="Save screenshot"><button className={btn} onClick={onScreenshot} aria-label="Save screenshot"><Camera className="size-4" /></button></Tooltip>
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 shadow-card backdrop-blur">
        <label htmlFor="auto-rot" className="flex items-center gap-1.5 text-xs font-semibold text-ink"><RefreshCcw className="size-3.5" /> Auto Rotate</label>
        <Switch id="auto-rot" checked={v.autoRotate} onCheckedChange={(c) => v.set({ autoRotate: c })} label="Auto rotate" />
        <span className="mx-1 h-4 w-px bg-line" />
        <button className={btn} onClick={onFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}</button>
      </div>
    </>
  );
}

export function ViewButtons() {
  const v = useViewer();
  const dirs: ViewDir[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  return (
    <div className="absolute inset-x-3 bottom-3 flex justify-center">
      <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface/95 p-1 shadow-card backdrop-blur" role="toolbar" aria-label="Camera views">
        <ScanEye className="mx-1.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
        {dirs.map((d) => <button key={d} onClick={() => v.requestView(d)} className="rounded-md px-2.5 py-1 text-xs font-semibold capitalize text-ink-muted hover:bg-canvas hover:text-ink">{d}</button>)}
        <span className="mx-1 h-4 w-px bg-line" />
        <button onClick={() => { v.set({ autoRotate: !v.autoRotate }); if (!v.autoRotate) v.requestView('front'); }} aria-pressed={v.autoRotate}
          className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', v.autoRotate ? 'bg-brand text-white' : 'text-brand-600 hover:bg-brand-50')}>▶ Turntable</button>
      </div>
    </div>
  );
}
