import { useState } from 'react';
import { toast } from 'sonner';
import { Check, X, Minus, Play, Pause, RotateCcw, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Callout, EmptyState } from '@/components/ui/misc';
import { useViewer } from '@/viewer/store';
import { UVMap } from '@/viewer/UVMap';
import type { SceneInfo } from '@/viewer/inspect';
import { http, errorMessage } from '@/services/api';
import type { ModelVersion } from '@/types/api';
import type { ModelMetadata } from './hooks';
import { formatBytes, formatNumber, formatDateTime, titleCase } from '@/utils/format';
import { cn } from '@/utils/cn';

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="border-b border-line px-4 py-4 last:border-0"><div className="mb-3 flex items-center justify-between"><h3 className="text-[13px] font-semibold">{title}</h3>{action}</div>{children}</section>;
}
function Row({ k, v, mono }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-3 py-1 text-[12.5px]"><dt className="text-ink-muted">{k}</dt><dd className={cn('text-right font-semibold tabular-nums', mono && 'font-mono text-[11.5px]')}>{v}</dd></div>;
}
const unitFmt = (v: number, calibrated: boolean, unit?: string) => (calibrated || unit === 'm' ? `${(v * 100).toFixed(1)} cm` : `${v.toFixed(3)} ${unit === 'relative' ? 'u' : 'u'}`);

export function StatsPanel({ meta, info }: { meta: ModelMetadata; info: SceneInfo | null }) {
  const s = meta.stats;
  if (!s) return <div className="p-4 text-[13px] text-ink-muted">Statistics are being measured…</div>;
  const dims = s.dimensions;
  return (
    <>
      <Section title="Model Statistics">
        <dl>
          <Row k="Vertices" v={formatNumber(s.vertices)} /><Row k="Triangles" v={formatNumber(s.triangles)} /><Row k="Polygons (faces)" v={formatNumber(s.faces)} />
          <Row k="Meshes" v={s.meshes} /><Row k="Materials" v={s.materials} />
          <Row k="Texture resolution" v={s.max_texture_resolution ? `${s.max_texture_resolution} × ${s.max_texture_resolution}` : 'No textures'} />
          <Row k="File size (GLB)" v={formatBytes(s.file_size)} />
          <Row k="Dimensions (W × H × D)" v={dims.map((d) => unitFmt(d, s.scale_calibrated, s.unit)).join(' × ')} />
          <Row k="Bounding box min" v={s.bbox_min.map((x) => x.toFixed(3)).join(', ')} mono /><Row k="Bounding box max" v={s.bbox_max.map((x) => x.toFixed(3)).join(', ')} mono />
          <Row k="Scale" v={s.scale_calibrated ? <Badge tone="success">Calibrated (m)</Badge> : <Badge tone="warning">Not calibrated</Badge>} />
          <Row k="Format" v={s.format.toUpperCase()} />
        </dl>
      </Section>
      <Section title="Attributes">
        <div className="flex flex-wrap gap-1.5">
          {[['UVs', s.has_uvs], ['Normals', s.has_normals], ['Vertex colours', s.has_vertex_colors], ['Skin / bones', s.has_skin], ['Animations', s.animations > 0]].map(([l, on]) => (
            <Badge key={l as string} tone={on ? 'success' : 'neutral'}>{on ? <Check className="size-3" /> : <Minus className="size-3" />}{l as string}</Badge>))}
        </div>
        {info && info.triangles !== s.triangles && <p className="mt-2 text-[11px] text-ink-subtle">Viewer reports {formatNumber(info.triangles)} triangles after loading (difference due to non-indexed primitives).</p>}
      </Section>
      {meta.source && (
        <Section title="Source">
          <dl>
            <Row k="Method" v={meta.source.mode === 'ai' ? `AI · ${titleCase(meta.source.provider)}` : 'Photogrammetry · COLMAP'} />
            <Row k="Images used" v={`${meta.source.used_images} / ${meta.source.input_images}`} />
            {meta.source.mode === 'photogrammetry' && <>
              <Row k="Registered images" v={`${meta.source.metrics.registered_images} / ${meta.source.metrics.total_images}`} />
              <Row k="Reprojection error" v={`${Number(meta.source.metrics.mean_reprojection_error).toFixed(3)} px`} />
              <Row k="Dense points" v={formatNumber(meta.source.metrics.dense_points as number)} />
              <Row k="Dense mode" v={String(meta.source.metrics.dense_mode)} />
            </>}
            <Row k="Created" v={formatDateTime(meta.source.created_at)} />
          </dl>
          {meta.source.log_url && <a href={meta.source.log_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">Open processing log</a>}
        </Section>
      )}
    </>
  );
}

export function TexturesPanel({ info, meta }: { info: SceneInfo | null; meta: ModelMetadata }) {
  if (!info) return null;
  if (!info.textures.length) return <EmptyState className="m-4" title="No textures" description={meta.stats?.has_vertex_colors ? 'This model stores colour per vertex instead of in texture maps.' : 'This model has no texture maps.'} />;
  return (
    <Section title={`Texture maps (${info.textures.length})`}>
      <div className="space-y-3">
        {info.textures.map((t) => (
          <figure key={t.key} className="overflow-hidden rounded-lg border border-line">
            {t.preview ? <img src={t.preview} alt={`${t.slot} texture`} className="aspect-square w-full bg-canvas object-contain" /> : <div className="grid aspect-square place-items-center bg-canvas text-xs text-ink-muted">Preview unavailable</div>}
            <figcaption className="flex items-center justify-between px-3 py-2 text-xs"><span className="font-semibold">{t.slot}</span><span className="text-ink-muted">{t.width} × {t.height}</span></figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

export function MaterialsPanel({ info }: { info: SceneInfo | null }) {
  const [, force] = useState(0);
  if (!info) return null;
  return (
    <Section title={`Materials (${info.materials.length})`}>
      <Callout tone="info" className="mb-3">Edits here preview live in the viewer. Use Refine to save material changes as a new version.</Callout>
      <div className="space-y-3">
        {info.materials.map((m, i) => {
          const std = m.ref as unknown as { color?: { set: (c: string) => void; getHexString: () => string }; roughness?: number; metalness?: number; needsUpdate: boolean };
          return (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between"><p className="text-[13px] font-semibold">{m.name}</p><span className="text-[11px] text-ink-muted">{m.type.replace('Mesh', '').replace('Material', '')}</span></div>
              <p className="mt-0.5 text-[11px] text-ink-muted">{m.maps.length ? m.maps.join(' · ') : 'No texture maps'}{m.doubleSided ? ' · double-sided' : ''}</p>
              {std.color && (
                <div className="mt-3 space-y-2 text-xs">
                  <label className="flex items-center justify-between">Base colour<input type="color" className="h-6 w-10 cursor-pointer rounded border border-line" defaultValue={`#${std.color.getHexString()}`}
                    onChange={(e) => { std.color!.set(e.target.value); force((x) => x + 1); }} aria-label={`${m.name} base colour`} /></label>
                  {typeof std.roughness === 'number' && <label className="flex items-center gap-3">Roughness<input type="range" min={0} max={1} step={0.01} defaultValue={std.roughness} className="flex-1 accent-brand" onChange={(e) => { std.roughness = +e.target.value; }} aria-label={`${m.name} roughness`} /></label>}
                  {typeof std.metalness === 'number' && <label className="flex items-center gap-3">Metallic<input type="range" min={0} max={1} step={0.01} defaultValue={std.metalness} className="flex-1 accent-brand" onChange={(e) => { std.metalness = +e.target.value; }} aria-label={`${m.name} metallic`} /></label>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function UVPanel({ info }: { info: SceneInfo | null }) {
  const [overlay, setOverlay] = useState(true);
  if (!info) return null;
  if (!info.hasUV) return <EmptyState className="m-4" title="No UV coordinates" description="This model has no UV map. Use the game-asset pipeline to unwrap UVs." />;
  const base = info.textures.find((t) => t.slot === 'Base Color')?.preview;
  return (
    <Section title="UV layout" action={base ? <label className="flex items-center gap-2 text-xs">Texture <Switch checked={overlay} onCheckedChange={setOverlay} label="Show texture under UVs" /></label> : undefined}>
      <UVMap meshes={info.uvMeshes} texture={overlay ? base : null} />
      <p className="mt-2 text-[11px] text-ink-muted">Viewer shows a checker map on the model so stretching and seams are visible.</p>
    </Section>
  );
}

function Check3({ ok, label, value }: { ok: boolean | null; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[12.5px]">
      <span className={cn('grid size-4 place-items-center rounded-full', ok === null ? 'bg-line text-ink-muted' : ok ? 'bg-success text-white' : 'bg-warning text-white')}>
        {ok === null ? <Minus className="size-2.5" /> : ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}</span>
      <span className="flex-1 text-ink-muted">{label}</span><span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function GeometryPanel({ meta }: { meta: ModelMetadata }) {
  const v = useViewer();
  const g = meta.stats?.integrity;
  return (
    <>
      {g && (
        <Section title="Mesh integrity (measured)">
          <Check3 ok={g.non_manifold_edges === 0} label="Non-manifold edges" value={formatNumber(g.non_manifold_edges)} />
          <Check3 ok={g.boundary_edges === 0} label="Open boundary edges" value={formatNumber(g.boundary_edges)} />
          <Check3 ok={g.degenerate_faces === 0} label="Degenerate faces" value={formatNumber(g.degenerate_faces)} />
          <Check3 ok={g.duplicate_faces === 0} label="Duplicate faces" value={formatNumber(g.duplicate_faces)} />
          <Check3 ok={g.winding_consistent} label="Consistent normals / winding" value={g.winding_consistent ? 'Yes' : 'No'} />
          <Check3 ok={g.watertight} label="Watertight" value={g.watertight ? 'Yes' : 'No'} />
          <Check3 ok={null} label="Connected components" value={g.components} />
          <Check3 ok={null} label="Surface area" value={g.surface_area.toFixed(4)} />
          <p className="mt-2 text-[11px] text-ink-subtle">Measured on a position-welded copy of the mesh (UV seams ignored). Open boundaries are normal for scans of objects standing on a surface.</p>
        </Section>
      )}
      {meta.source?.mode === 'photogrammetry' && (
        <Section title="Reconstruction data">
          <label className="flex items-center justify-between py-1 text-[13px]">Dense point cloud<Switch checked={v.showPointCloud} onCheckedChange={(c) => v.set({ showPointCloud: c })} label="Show point cloud" disabled={!meta.source.point_cloud_url} /></label>
          <label className="flex items-center justify-between py-1 text-[13px]">Camera positions<Switch checked={v.showCameras} onCheckedChange={(c) => v.set({ showCameras: c })} label="Show cameras" disabled={!meta.source.cameras_url} /></label>
          <p className="mt-1 text-[11px] text-ink-subtle">Cameras are drawn at the poses COLMAP estimated, in the model's coordinate frame.</p>
        </Section>
      )}
    </>
  );
}

export function VersionsPanel({ modelId, versions, currentId, viewingId, onView, onChanged }: { modelId: string; versions: ModelVersion[]; currentId: string | null; viewingId: string | null; onView: (id: string) => void; onChanged: () => void }) {
  async function restore(v: ModelVersion) {
    try { await http.put(`/models/${modelId}/current-version`, { version_id: v.id }); toast.success(`Version ${v.version} is now current`); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function remove(v: ModelVersion) {
    try { await http.del(`/models/${modelId}/versions/${v.id}`); toast.success('Version deleted'); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  }
  return (
    <Section title={`Version history (${versions.length})`}>
      <ol className="space-y-2">
        {versions.map((v) => (
          <li key={v.id} className={cn('rounded-lg border p-2.5', (viewingId ?? currentId) === v.id ? 'border-brand bg-brand-50/50' : 'border-line')}>
            <div className="flex items-center justify-between gap-2">
              <button className="min-w-0 text-left" onClick={() => onView(v.id)}>
                <p className="truncate text-[13px] font-semibold">v{v.version} · {v.label}</p>
                <p className="text-[11px] text-ink-muted">{titleCase(v.operation)} · {v.stats ? `${formatNumber(v.stats.triangles)} tris · ` : ''}{formatBytes(v.file_size)} · {formatDateTime(v.created_at)}</p>
              </button>
              {v.id === currentId ? <Badge tone="brand">Current</Badge> : (
                <div className="flex shrink-0 gap-0.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => restore(v)} aria-label={`Restore version ${v.version}`} title="Make current"><RotateCcw /></Button>
                  <Button variant="danger-ghost" size="icon-sm" onClick={() => remove(v)} aria-label={`Delete version ${v.version}`}><Trash2 /></Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function LODPanel({ versions, onView, viewingId }: { versions: ModelVersion[]; onView: (id: string) => void; viewingId: string | null }) {
  const lods = versions.filter((v) => v.is_lod).sort((a, b) => (a.lod_level ?? 0) - (b.lod_level ?? 0));
  if (!lods.length) return <EmptyState className="m-4" title="No LODs yet" description="Generate a level-of-detail chain in the game-asset optimisation step." />;
  return (
    <Section title="Levels of detail">
      {lods.map((v) => (
        <button key={v.id} onClick={() => onView(v.id)} className={cn('mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px]', viewingId === v.id ? 'border-brand bg-brand-50/50' : 'border-line')}>
          <span className="font-semibold">LOD{v.lod_level}</span><span className="text-ink-muted">{v.stats ? `${formatNumber(v.stats.triangles)} tris` : '…'}</span>
        </button>
      ))}
    </Section>
  );
}

export function SkeletonPanel({ info }: { info: SceneInfo | null }) {
  const v = useViewer();
  if (!info) return null;
  if (!info.bones.length) return <EmptyState className="m-4" title="No skeleton" description="This model is not rigged. Rigging is available for characters when the AI provider supports it." />;
  return (
    <Section title={`Skeleton (${info.bones.length} bones)`} action={<label className="flex items-center gap-2 text-xs">Show <Switch checked={v.showSkeleton} onCheckedChange={(c) => v.set({ showSkeleton: c })} label="Show skeleton" /></label>}>
      <ul className="max-h-96 overflow-y-auto font-mono text-[11.5px]">{info.bones.map((b, i) => <li key={i} style={{ paddingLeft: b.depth * 10 }} className="truncate py-0.5">└ {b.name}</li>)}</ul>
    </Section>
  );
}

export function AnimationPanel({ info }: { info: SceneInfo | null }) {
  const v = useViewer();
  if (!info) return null;
  if (!info.animations.length) return <EmptyState className="m-4" title="No animations" description="This model contains no animation clips." />;
  return (
    <Section title={`Animations (${info.animations.length})`}>
      {info.animations.map((a) => {
        const active = v.clip === a.name && v.playing;
        return (
          <div key={a.name} className="mb-2 flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
            <div><p className="font-semibold">{a.name}</p><p className="text-[11px] text-ink-muted">{a.duration.toFixed(2)} s · {a.tracks} tracks</p></div>
            <Button size="icon-sm" variant={active ? 'primary' : 'secondary'} aria-label={active ? `Pause ${a.name}` : `Play ${a.name}`} onClick={() => v.set({ clip: a.name, playing: !active })}>{active ? <Pause /> : <Play />}</Button>
          </div>
        );
      })}
    </Section>
  );
}

export function DownloadVersion({ v }: { v: ModelVersion | null }) {
  if (!v) return null;
  return <a href={v.file_url} download className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"><Download className="size-3.5" /> GLB</a>;
}
