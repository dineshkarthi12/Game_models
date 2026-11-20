import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles, ScanLine, Check, AlertTriangle, Info, Coins, ArrowLeft, Play, Cpu, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Segmented, Callout, Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { http, errorMessage } from '@/services/api';
import { useInvalidate } from '@/hooks/queries';
import { useImages } from '@/features/upload/hooks';
import { ANGLE_LABELS } from '@/features/upload/angles';
import { ASSET_CATEGORIES, CATEGORY_LABELS, type GenerationSettings, type Generation, type Project, type ProviderInfo, type SystemStatus } from '@/types/api';
import { cn } from '@/utils/cn';

interface Preview { cost: number; balance: number; plan: string; selected_image_ids: string[]; reason: string; warnings: string[]; blocking: string[]; image_count: number }

const QUALITY = [{ value: 'draft', label: 'Draft' }, { value: 'standard', label: 'Standard' }, { value: 'high', label: 'High Detail' }, { value: 'ultra', label: 'Ultra' }] as const;
const TEX_LABEL: Record<string, string> = { none: 'None', '1k': '1K', '2k': '2K', '4k': '4K', '8k': '8K' };
const PHOTO_SIZE: Record<string, number> = { draft: 1000, standard: 1600, high: 2400, ultra: 3200 };

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function ConfigureStep({ project, initialMode, onBack }: { project: Project; initialMode: 'ai' | 'photogrammetry'; onBack: () => void }) {
  const nav = useNavigate(); const inv = useInvalidate();
  const [mode, setMode] = useState<'ai' | 'photogrammetry'>(initialMode);
  const { data: sys } = useQuery({ queryKey: ['system'], queryFn: () => http.get<SystemStatus>('/system/status'), staleTime: 60_000 });
  const { data: imgs } = useImages(project.id);
  const providers = useMemo(() => sys?.providers ?? [], [sys]);
  const [providerId, setProviderId] = useState<string>('');
  useEffect(() => {
    if (!providerId && providers.length) setProviderId((providers.find((p) => p.configured && !p.is_demo) ?? providers.find((p) => p.configured) ?? providers[0]!).id);
  }, [providers, providerId]);
  const provider: ProviderInfo | undefined = providers.find((p) => p.id === providerId);
  const cap = provider?.capabilities;

  const [s, setS] = useState<GenerationSettings>({
    category: project.category, quality: 'standard', polygon_level: 'medium', texture_resolution: '2k', pbr: false, topology: 'triangle', remesh: true, rig: false, symmetry: 'auto',
    matcher: 'exhaustive', max_image_size: 1600,
  });
  const [useDim, setUseDim] = useState(false);
  const [dim, setDim] = useState<{ axis: 'x' | 'y' | 'z' | 'longest'; value: number; unit: 'mm' | 'cm' | 'm' | 'in' }>({ axis: 'longest', value: 30, unit: 'cm' });
  const set = <K extends keyof GenerationSettings>(k: K, v: GenerationSettings[K]) => setS((o) => ({ ...o, [k]: v }));

  // Keep settings within what the selected provider genuinely supports.
  useEffect(() => {
    if (!cap || mode !== 'ai') return;
    setS((o) => ({
      ...o,
      texture_resolution: cap.texture_resolutions.includes(o.texture_resolution) ? o.texture_resolution : (cap.texture_resolutions.find((t) => t !== 'none') as GenerationSettings['texture_resolution']) ?? 'none',
      pbr: cap.supports_pbr ? o.pbr : false, rig: cap.supports_rigging ? o.rig : false, topology: cap.supports_topology ? o.topology : 'triangle',
      texture_prompt: cap.supports_texture_prompt ? o.texture_prompt : undefined,
    }));
  }, [cap, mode]);

  const payload = useMemo(() => {
    const settings: GenerationSettings = { ...s, max_image_size: PHOTO_SIZE[s.quality], known_dimension: mode === 'photogrammetry' && useDim ? dim : undefined };
    if (!settings.texture_prompt) delete settings.texture_prompt;
    if (settings.polygon_level !== 'custom') delete settings.target_polycount;
    return { project_id: project.id, mode, provider: mode === 'ai' ? providerId : 'colmap', settings };
  }, [s, mode, useDim, dim, project.id, providerId]);
  const debounced = useDebounced(payload);
  const { data: preview, isFetching } = useQuery({
    queryKey: ['gen-preview', debounced, imgs?.items.length], enabled: !!debounced.provider,
    queryFn: () => http.post<Preview>('/generations/preview', debounced),
  });
  const [starting, setStarting] = useState(false);
  async function start() {
    setStarting(true);
    try {
      const g = mode === 'ai' ? await http.post<Generation>('/generations', payload) : await http.post<Generation>('/reconstruction', { project_id: project.id, settings: payload.settings });
      await inv('me', 'dashboard', 'generations', 'projects');
      nav(`/app/jobs/${g.id}`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setStarting(false); }
  }

  const selected = new Set(preview?.selected_image_ids ?? []);
  const planQualities = preview?.plan === 'free' ? ['draft', 'standard'] : ['draft', 'standard', 'high', 'ultra'];
  const charRig = ['human', 'creature', 'animal'].includes(s.category);

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr_320px]">
      {/* ── Left: mode + settings ── */}
      <section className="surface space-y-5 p-5" aria-label="Generation settings">
        <div>
          <h2 className="mb-2 text-[15px] font-semibold">Reconstruction mode</h2>
          <div className="space-y-2" role="radiogroup" aria-label="Reconstruction mode">
            {([['ai', Sparkles, 'AI Reconstruction', 'Meshy / Tripo · fast generation with AI (1–4 images)'], ['photogrammetry', ScanLine, 'Precision Reconstruction', 'Photogrammetry · COLMAP · overlapping photos']] as const).map(([id, I, t, d]) => (
              <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
                className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors', mode === id ? 'border-brand bg-brand-50/60' : 'border-line hover:border-line-strong')}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-brand shadow-card"><I className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold">{t}</span><span className="block text-xs text-ink-muted">{d}</span></span>
                {mode === id && <Check className="size-4 text-brand" />}
              </button>
            ))}
          </div>
        </div>

        {mode === 'ai' && (
          <div>
            <Label>Provider</Label>
            {!providers.length ? <Skeleton className="h-20" /> : (
              <div className="space-y-2">
                {providers.map((p) => (
                  <button key={p.id} onClick={() => p.configured && setProviderId(p.id)} disabled={!p.configured} aria-pressed={providerId === p.id}
                    className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px]', providerId === p.id ? 'border-brand bg-brand-50/60' : 'border-line', !p.configured && 'cursor-not-allowed opacity-60')}>
                    <span className="font-semibold">{p.name}</span>
                    {p.is_demo ? <Badge tone="warning">Demo</Badge> : p.configured ? <Badge tone="success">Available</Badge> : <Badge tone="warning">Configuration required</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div><Label htmlFor="g-cat">Asset type</Label>
          <Select id="g-cat" value={s.category} onChange={(e) => set('category', e.target.value as GenerationSettings['category'])}>{ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</Select></div>

        <div><Label>Quality</Label>
          <Segmented ariaLabel="Quality" size="sm" value={s.quality} onChange={(v) => set('quality', v)}
            options={QUALITY.map((q) => ({ ...q, disabled: !planQualities.includes(q.value), title: !planQualities.includes(q.value) ? 'Requires Pro or Studio plan' : undefined, label: <>{!planQualities.includes(q.value) && <Lock className="mr-1 inline size-3" />}{q.label}</> }))} />
          {mode === 'photogrammetry' && <p className="mt-1.5 text-xs text-ink-muted">Images are processed at up to {PHOTO_SIZE[s.quality]}px on the long side.</p>}
        </div>

        {mode === 'ai' && cap && (
          <>
            {cap.supports_polycount && (
              <div><Label htmlFor="g-poly">Polygon level</Label>
                <Select id="g-poly" value={s.polygon_level} onChange={(e) => set('polygon_level', e.target.value as GenerationSettings['polygon_level'])}>
                  <option value="low">Low (~10K)</option><option value="medium">Medium (~50K)</option><option value="high">High (~150K)</option><option value="custom">Custom</option>
                </Select>
                {s.polygon_level === 'custom' && <Input className="mt-2" type="number" min={cap.polycount_range?.[0]} max={cap.polycount_range?.[1]} aria-label="Target polygon count"
                  placeholder={`${cap.polycount_range?.[0]}–${cap.polycount_range?.[1]}`} value={s.target_polycount ?? ''} onChange={(e) => set('target_polycount', Number(e.target.value) || undefined)} />}
              </div>
            )}
            <div><Label>Texture resolution</Label>
              <Segmented ariaLabel="Texture resolution" size="sm" value={s.texture_resolution} onChange={(v) => set('texture_resolution', v)}
                options={cap.texture_resolutions.map((t) => ({ value: t as GenerationSettings['texture_resolution'], label: TEX_LABEL[t] }))} /></div>
            <div className="space-y-3">
              {cap.supports_pbr && <ToggleRow label="PBR maps" hint="Metallic, roughness and normal maps" checked={s.pbr} disabled={s.texture_resolution === 'none'} onChange={(v) => set('pbr', v)} />}
              {cap.supports_topology && <ToggleRow label="Quad topology" hint="Quad-dominant mesh instead of triangles" checked={s.topology === 'quad'} onChange={(v) => set('topology', v ? 'quad' : 'triangle')} />}
              {cap.supports_remesh && <ToggleRow label="Remesh" hint="Provider-side remeshing to the target polycount" checked={!!s.remesh} onChange={(v) => set('remesh', v)} />}
              {cap.supports_rigging && <ToggleRow label="Rigging" hint={charRig ? 'Humanoid/creature skeleton from the provider' : 'Only for characters, creatures and animals'} checked={!!s.rig} disabled={!charRig} onChange={(v) => set('rig', v)} />}
            </div>
            {cap.supports_symmetry && (
              <div><Label htmlFor="g-sym">Symmetry</Label><Select id="g-sym" value={s.symmetry} onChange={(e) => set('symmetry', e.target.value as 'off' | 'auto' | 'on')}><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></Select></div>
            )}
            {cap.supports_texture_prompt && <div><Label htmlFor="g-tp">Texture prompt <span className="font-normal text-ink-muted">(optional)</span></Label><Textarea id="g-tp" maxLength={600} className="min-h-[60px]" value={s.texture_prompt ?? ''} onChange={(e) => set('texture_prompt', e.target.value)} placeholder="e.g. weathered sandstone" /></div>}
          </>
        )}

        {mode === 'photogrammetry' && (
          <>
            <div><Label htmlFor="g-match">Feature matching</Label>
              <Select id="g-match" value={s.matcher} onChange={(e) => set('matcher', e.target.value as 'exhaustive' | 'sequential')}>
                <option value="exhaustive">Exhaustive (any capture order, best up to ~150 images)</option><option value="sequential">Sequential (video frames / ordered walk-around)</option>
              </Select></div>
            <div className="space-y-2">
              <ToggleRow label="Known dimension" hint="Calibrate real-world scale from one measurement" checked={useDim} onChange={setUseDim} />
              {useDim && (
                <div className="grid grid-cols-[1fr_1fr_80px] gap-2">
                  <Select aria-label="Measured axis" value={dim.axis} onChange={(e) => setDim({ ...dim, axis: e.target.value as typeof dim.axis })}><option value="longest">Longest side</option><option value="x">Width (X)</option><option value="y">Height (Y)</option><option value="z">Depth (Z)</option></Select>
                  <Input aria-label="Measured value" type="number" min={0.01} step="any" value={dim.value} onChange={(e) => setDim({ ...dim, value: Number(e.target.value) })} />
                  <Select aria-label="Unit" value={dim.unit} onChange={(e) => setDim({ ...dim, unit: e.target.value as typeof dim.unit })}><option>mm</option><option>cm</option><option>m</option><option>in</option></Select>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Centre: images actually used ── */}
      <section className="surface p-5" aria-label="Images used">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Reference images</h2><span className="text-xs text-ink-muted">{selected.size} of {imgs?.items.length ?? 0} will be sent</span></div>
        {preview?.reason && <Callout tone="info" icon={<Info />} className="mb-4">{preview.reason}</Callout>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {imgs?.items.map((im) => (
            <figure key={im.id} className={cn('relative overflow-hidden rounded-lg border-2', selected.has(im.id) ? 'border-brand' : 'border-transparent opacity-45')}>
              <img src={im.thumb_url} alt={`${ANGLE_LABELS[im.angle]} — ${im.original_name}`} className="aspect-square w-full object-cover" loading="lazy" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 px-1.5 py-1 text-[10.5px] font-semibold text-white">{ANGLE_LABELS[im.angle]}</figcaption>
              {selected.has(im.id) && <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-brand text-white"><Check className="size-3" /></span>}
            </figure>
          ))}
        </div>
        {cap && mode === 'ai' && <ul className="mt-4 space-y-1 text-xs text-ink-muted">{cap.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
        {mode === 'photogrammetry' && sys && (
          <Callout tone={sys.tools.colmap.available ? 'info' : 'danger'} icon={<Cpu />} className="mt-4" title={sys.tools.colmap.available ? `COLMAP ${sys.tools.colmap.version ?? ''} on this server` : 'COLMAP is not installed on this server'}>
            {sys.tools.colmap.cuda ? 'CUDA available: dense multi-view stereo will be used.' : 'No CUDA GPU: COLMAP dense stereo is unavailable, so the mesh is built from the sparse reconstruction (Delaunay) and textured by projecting your photos. Detail is lower than GPU dense reconstruction.'}
          </Callout>
        )}
        {mode === 'photogrammetry' && <Callout tone="warning" icon={<AlertTriangle />} className="mt-3" title="Difficult surfaces">Reflective, transparent and featureless objects rarely match. Use diffuse light, matte spray or textured markers. <a className="font-semibold underline" href="/docs#capture" target="_blank" rel="noreferrer">Capture guide</a></Callout>}
      </section>

      {/* ── Right: summary ── */}
      <aside className="surface h-fit space-y-4 p-5 xl:sticky xl:top-20">
        <h2 className="text-[15px] font-semibold">Summary</h2>
        <dl className="space-y-2 text-[13px]">
          <Row k="Mode" v={mode === 'ai' ? 'AI Reconstruction' : 'Photogrammetry'} />
          <Row k="Engine" v={mode === 'ai' ? provider?.name ?? '—' : 'COLMAP'} />
          <Row k="Asset type" v={CATEGORY_LABELS[s.category]} />
          <Row k="Quality" v={QUALITY.find((q) => q.value === s.quality)?.label} />
          {mode === 'ai' && <Row k="Texture" v={`${TEX_LABEL[s.texture_resolution]}${s.pbr ? ' + PBR' : ''}`} />}
          <Row k="Images used" v={`${selected.size} / ${preview?.image_count ?? 0}`} />
        </dl>
        <div className="rounded-lg bg-canvas p-3 text-[13px]">
          <div className="flex items-center justify-between font-semibold"><span className="flex items-center gap-1.5"><Coins className="size-4 text-brand" /> Cost</span><span>{preview ? `${preview.cost} credits` : '—'}</span></div>
          <p className="mt-1 text-xs text-ink-muted">Balance {preview?.balance ?? '—'} · refunded automatically if the job fails</p>
        </div>
        {preview?.blocking.map((b) => <Callout key={b} tone="danger">{b}</Callout>)}
        {preview?.warnings.map((w) => <Callout key={w} tone="warning">{w}</Callout>)}
        <Button className="w-full" size="lg" onClick={start} loading={starting} disabled={!preview || !!preview.blocking.length || isFetching}><Play /> {mode === 'ai' ? 'Generate model' : 'Start reconstruction'}</Button>
        <Button variant="ghost" className="w-full" onClick={onBack}><ArrowLeft /> Back to images</Button>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) { return <div className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>; }
function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = `t-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={cn('flex items-center justify-between gap-3', disabled && 'opacity-50')}>
      <label htmlFor={id} className="min-w-0"><span className="block text-[13px] font-medium">{label}</span><span className="block text-xs text-ink-muted">{hint}</span></label>
      <Switch id={id} checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}
