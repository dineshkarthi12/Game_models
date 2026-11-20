import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, Label, Input, Checkbox } from '@/components/ui/input';
import { Callout } from '@/components/ui/misc';
import { http, errorMessage } from '@/services/api';
import { useVersions } from '@/features/workspace/hooks';
import type { ExportJob } from '@/types/api';
import { cn } from '@/utils/cn';

interface Preset { id: string; name: string; formats: string[]; units: 'm' | 'cm' | 'mm'; up_axis: 'Y' | 'Z'; forward_axis: string; collision: boolean; notes: string[] }
const FORMAT_LABEL: Record<string, string> = { fbx: 'FBX', glb: 'GLB', gltf: 'GLTF', obj: 'OBJ', usd: 'USD', usdz: 'USDZ', stl: 'STL' };
const ICON: Record<string, string> = { blender: 'B', maya: 'M', unreal: 'U', unity: 'U', godot: 'G', universal: '∗' };

export function ExportForm({ modelId, onStarted }: { modelId: string; onStarted?: (j: ExportJob) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['export-presets'], queryFn: () => http.get<{ formats: string[]; items: Preset[] }>('/export-presets') });
  const { data: versions } = useVersions(modelId);
  const [preset, setPreset] = useState('blender');
  const [formats, setFormats] = useState<string[]>([]);
  const [s, setS] = useState({ scale: 1, units: 'm', up_axis: 'Y', forward_axis: '-Z', texture_resolution: 'original', include_textures: true, include_materials: true, include_normals: true,
    include_uvs: true, include_skeleton: true, include_animation: true, include_collision: false, triangulate: true, lods: [] as number[] });
  const [versionId, setVersionId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const p = data?.items.find((x) => x.id === preset);
  useEffect(() => { if (p) { setFormats(p.formats); setS((o) => ({ ...o, units: p.units, up_axis: p.up_axis, forward_axis: p.forward_axis, include_collision: p.collision })); } }, [p]);
  const current = versions?.items.find((v) => v.id === (versionId || undefined)) ?? versions?.items[0];
  const selected = versionId ? versions?.items.find((v) => v.id === versionId) : versions?.items.find((v) => v.is_lod && v.lod_level === 0) ?? current;
  const params = selected?.params as { lod_versions?: string[]; collision?: unknown } | undefined;
  const availableLods = useMemo(() => (versions?.items ?? []).filter((v) => params?.lod_versions?.includes(v.id)).map((v) => v.lod_level!).sort(), [versions, params]);
  const hasCollision = !!params?.collision;
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((o) => ({ ...o, [k]: v }));

  async function start() {
    setBusy(true);
    try {
      const j = await http.post<ExportJob>(`/models/${modelId}/export`, { preset, formats, version_id: versionId || undefined, settings: { ...s, include_collision: s.include_collision && hasCollision } });
      await qc.invalidateQueries({ queryKey: ['exports'] }); toast.success('Export started'); onStarted?.(j);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>Target application</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Target application">
          {data?.items.map((x) => (
            <button key={x.id} role="radio" aria-checked={preset === x.id} onClick={() => setPreset(x.id)}
              className={cn('relative rounded-xl border p-3 text-left transition-colors', preset === x.id ? 'border-brand bg-brand-50/60' : 'border-line hover:border-line-strong')}>
              {preset === x.id && <Check className="absolute right-2 top-2 size-4 text-brand" />}
              <span className="grid size-8 place-items-center rounded-lg bg-ink text-sm font-bold text-white">{ICON[x.id]}</span>
              <span className="mt-2 block text-[13px] font-semibold">{x.name}</span>
              <span className="block text-[11px] text-ink-muted">{x.formats.map((f) => FORMAT_LABEL[f]).join(' / ')}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Formats</Label>
        <div className="flex flex-wrap gap-3">{data?.formats.map((f) => <Checkbox key={f} label={FORMAT_LABEL[f]} checked={formats.includes(f)} onChange={(e) => setFormats(e.target.checked ? [...formats, f] : formats.filter((x) => x !== f))} />)}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="ex-ver">Version</Label>
          <Select id="ex-ver" value={versionId} onChange={(e) => setVersionId(e.target.value)}><option value="">{selected ? `v${selected.version} · ${selected.label}` : 'Current'}</option>{versions?.items.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.label}</option>)}</Select></div>
        <div><Label htmlFor="ex-tex">Texture resolution</Label>
          <Select id="ex-tex" value={s.texture_resolution} onChange={(e) => set('texture_resolution', e.target.value)}><option value="original">Original</option><option value="4k">4K (4096)</option><option value="2k">2K (2048)</option><option value="1k">1K (1024)</option></Select></div>
        <div><Label htmlFor="ex-lod">LOD</Label>
          <Select id="ex-lod" value={s.lods.length ? `0-${Math.max(...s.lods)}` : '0'} onChange={(e) => set('lods', e.target.value === '0' ? [] : availableLods.filter((l) => l <= Number(e.target.value.split('-')[1])))} disabled={!availableLods.length}>
            <option value="0">LOD0 only</option>{availableLods.map((l) => <option key={l} value={`0-${l}`}>LOD0 – LOD{l}</option>)}</Select></div>
        <div><Label htmlFor="ex-units">Units</Label><Select id="ex-units" value={s.units} onChange={(e) => set('units', e.target.value)}><option value="m">Metres</option><option value="cm">Centimetres</option><option value="mm">Millimetres</option></Select></div>
        <div><Label htmlFor="ex-up">Up axis</Label><Select id="ex-up" value={s.up_axis} onChange={(e) => set('up_axis', e.target.value)}><option>Y</option><option>Z</option></Select></div>
        <div><Label htmlFor="ex-fwd">Forward axis</Label><Select id="ex-fwd" value={s.forward_axis} onChange={(e) => set('forward_axis', e.target.value)}>{['-Z', 'Z', '-Y', 'Y', 'X', '-X'].map((a) => <option key={a}>{a}</option>)}</Select></div>
        <div><Label htmlFor="ex-scale">Scale</Label><Input id="ex-scale" type="number" min={0.0001} step="any" value={s.scale} onChange={(e) => set('scale', Number(e.target.value) || 1)} /></div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {([['include_textures', 'Include textures'], ['include_materials', 'Include materials'], ['include_normals', 'Normals'], ['include_uvs', 'UVs'], ['include_skeleton', 'Skeleton (if available)'], ['include_animation', 'Animation (if available)'], ['triangulate', 'Triangulate']] as const).map(([k, l]) => (
          <Checkbox key={k} label={l} checked={s[k]} onChange={(e) => set(k, e.target.checked)} />))}
        <Checkbox label={`Collision mesh${hasCollision ? '' : ' (create in Game Optimize)'}`} disabled={!hasCollision} checked={s.include_collision && hasCollision} onChange={(e) => set('include_collision', e.target.checked)} />
      </div>
      {p && <Callout tone="info" title={`${p.name} notes`}><ul className="space-y-0.5">{p.notes.map((n) => <li key={n}>• {n}</li>)}</ul></Callout>}
      <p className="text-xs text-ink-muted">Files are produced by Blender's native exporters (USD/USDZ by Pixar's USD library) and re-imported to verify geometry before the download is enabled. Extensions are never renamed to fake a format.</p>
      <Button size="lg" className="w-full" onClick={start} loading={busy} disabled={!formats.length}><Download /> Export &amp; package</Button>
    </div>
  );
}
