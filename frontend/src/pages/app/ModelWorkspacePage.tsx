import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Grid2x2, Image, Palette, Grid3x3, Shapes, Layers, Bone, Clapperboard, Columns2, AlertTriangle } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Callout, Skeleton, EmptyState } from '@/components/ui/misc';
import { Select } from '@/components/ui/input';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { SourceBadge } from '@/components/models/ModelCard';
import { ModelViewer } from '@/viewer/ModelViewer';
import { useViewer, type ViewMode } from '@/viewer/store';
import type { SceneInfo } from '@/viewer/inspect';
import { ViewerToolbar, ViewButtons } from '@/features/workspace/ViewerChrome';
import { useModelMetadata, useVersions } from '@/features/workspace/hooks';
import { StatsPanel, TexturesPanel, MaterialsPanel, UVPanel, GeometryPanel, VersionsPanel, LODPanel, SkeletonPanel, AnimationPanel, DownloadVersion } from '@/features/workspace/Panels';
import { WorkspaceActions, ExtraTabs, extraTabContent } from '@/features/workspace/extensions';
import { cn } from '@/utils/cn';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export const TABS = [
  { id: 'preview', label: '3D Preview', icon: Box, mode: 'shaded' }, { id: 'wireframe', label: 'Wireframe', icon: Grid2x2, mode: 'wireframe' },
  { id: 'textures', label: 'Textures', icon: Image, mode: 'shaded' }, { id: 'materials', label: 'Materials', icon: Palette, mode: 'shaded' },
  { id: 'uv', label: 'UV Maps', icon: Grid3x3, mode: 'uv' }, { id: 'geometry', label: 'Geometry', icon: Shapes, mode: 'clay' },
  { id: 'lod', label: 'LOD', icon: Layers, mode: 'shaded' }, { id: 'skeleton', label: 'Skeleton', icon: Bone, mode: 'shaded' },
  { id: 'animation', label: 'Animation', icon: Clapperboard, mode: 'shaded' }, { id: 'compare', label: 'Compare', icon: Columns2, mode: 'shaded' },
] as const;

export default function ModelWorkspacePage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'preview';
  const viewingParam = params.get('version');
  const qc = useQueryClient();
  const { data: meta, isLoading, isError } = useModelMetadata(id, viewingParam);
  const { data: versions } = useVersions(id);
  const [info, setInfo] = useState<SceneInfo | null>(null);
  const setViewer = useViewer((s) => s.set);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [rightTab, setRightTab] = useState<'info' | 'versions' | string>('info');
  const wide = useMediaQuery('(min-width: 1536px)');
  const [compareA, setCompareA] = useState<string>(''); const [compareB, setCompareB] = useState<string>('');

  const allTabs = [...TABS, ...ExtraTabs];
  useEffect(() => {
    const t = allTabs.find((x) => x.id === tab);
    setViewer({ mode: (t?.mode ?? 'shaded') as ViewMode, showSkeleton: tab === 'skeleton', playing: false });
    setRightTab(['preview', 'wireframe', 'compare'].includes(tab) ? 'info' : tab);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  useEffect(() => {
    if (versions?.items.length && !compareA) { setCompareA(versions.items[versions.items.length - 1]!.id); setCompareB(versions.items[0]!.id); }
  }, [versions, compareA]);

  if (isError) return <EmptyState icon={<Box />} title="Model not found" description="It may have been deleted, or you may not have access." />;
  if (isLoading || !meta) return <Skeleton className="h-[70vh]" />;
  const model = meta.model;
  const version = meta.version;
  const setTab = (t: string) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }); };
  const viewVersion = (vid: string) => { const n = new URLSearchParams(params); if (vid === model.current_version_id) n.delete('version'); else n.set('version', vid); setParams(n, { replace: true }); };
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['model-metadata', id] }), qc.invalidateQueries({ queryKey: ['model-versions', id] }), qc.invalidateQueries({ queryKey: ['model', id] })]);
  const screenshot = () => {
    const c = containerRef.current?.querySelector('canvas'); if (!c) return;
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${model.name.replace(/[^\w.-]+/g, '_')}_v${version?.version ?? ''}.png`; a.click();
  };
  const vA = versions?.items.find((v) => v.id === compareA); const vB = versions?.items.find((v) => v.id === compareB);

  return (
    <div className="mx-auto max-w-[1700px]">
      <Breadcrumbs items={[{ label: 'Projects', to: '/app/projects' }, { label: model.project_name ?? 'Project', to: `/app/projects/${model.project_id}` }, { label: 'Model Workspace' }]} />
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-bold">{model.name}</h1><SourceBadge model={model} />
          {model.status !== 'ready' && <StatusBadge status={model.status} />}{model.game_ready && <Badge tone="success">Game-ready</Badge>}
          {versions && (
            <Select aria-label="Version" className="h-8 w-auto py-0 text-xs" value={version?.id ?? ''} onChange={(e) => viewVersion(e.target.value)}>
              {versions.items.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.label}{v.id === model.current_version_id ? ' (current)' : ''}</option>)}
            </Select>
          )}
          <DownloadVersion v={version} />
        </div>
        <WorkspaceActions model={model} />
      </div>
      {model.is_demo && <Callout tone="warning" icon={<AlertTriangle />} className="mb-4" title="Demo output">This model was generated procedurally by the Demo provider. It is not reconstructed from your photos and must not be used to judge accuracy.</Callout>}
      {viewingParam && viewingParam !== model.current_version_id && <Callout tone="info" className="mb-4">You are viewing version {version?.version}, not the current version.</Callout>}

      <div className="grid gap-4 lg:grid-cols-[190px_1fr] 2xl:grid-cols-[190px_1fr_340px]">
        <nav className="surface flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible" aria-label="Workspace views">
          {allTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium', tab === t.id ? 'bg-brand-50 text-brand-600' : 'text-ink-muted hover:bg-canvas hover:text-ink')}>
              <t.icon className="size-4" />{t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === 'compare' ? (
            <div className="surface p-3">
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {[[compareA, setCompareA, 'Before'], [compareB, setCompareB, 'After']].map(([val, set, label]) => (
                  <label key={label as string} className="flex items-center gap-2 text-xs font-semibold">{label as string}
                    <Select className="h-8 py-0 text-xs" value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}>{versions?.items.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.label}</option>)}</Select>
                  </label>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {[vA, vB].map((v, i) => v && (
                  <div key={i} className="relative overflow-hidden rounded-lg border border-line">
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white">{i === 0 ? 'Before' : 'After'} · v{v.version}{v.stats ? ` · ${v.stats.triangles.toLocaleString()} tris` : ''}</span>
                    <ModelViewer url={v.file_url} syncId={`cmp-${i}`} className="h-[58vh] min-h-[360px]" />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-muted">Orbiting either view moves both cameras.</p>
            </div>
          ) : (
            <div ref={containerRef} className="surface relative overflow-hidden bg-canvas">
              {version ? (
                <>
                  <ModelViewer url={version.file_url} pointCloudUrl={meta.source?.point_cloud_url} camerasUrl={meta.source?.cameras_url} onInfo={setInfo} className={cn('w-full', fullscreen ? 'h-screen' : 'h-[68vh] min-h-[420px]')} />
                  <ViewerToolbar fullscreen={fullscreen} onScreenshot={screenshot} onFullscreen={() => (document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen())} />
                  <ViewButtons />
                </>
              ) : <div className="grid h-[60vh] place-items-center text-sm text-ink-muted">{model.status === 'processing' ? 'The model is still being processed…' : 'No model file available.'}</div>}
            </div>
          )}
          {/* Panels flow below the viewer on narrower screens */}
          {!wide && <div className="surface mt-4">{tab === 'preview' || tab === 'wireframe' ? <StatsPanel meta={meta} info={info} /> : panelFor(tab)}</div>}
        </div>

        {wide && <aside className="surface h-fit max-h-[calc(100vh-7rem)] overflow-y-auto 2xl:sticky 2xl:top-20">
          <div className="flex border-b border-line" role="tablist">
            {[['info', 'Model Info'], ['versions', 'Versions'], ...(['textures', 'materials', 'uv', 'geometry', 'lod', 'skeleton', 'animation', ...ExtraTabs.map((t) => t.id)].includes(tab) ? [[tab, allTabs.find((t) => t.id === tab)!.label]] : [])].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={rightTab === k || (rightTab === 'info' && k === tab)} onClick={() => setRightTab(k!)}
                className={cn('-mb-px flex-1 border-b-2 px-3 py-2.5 text-[12.5px] font-semibold', (rightTab === k) ? 'border-brand text-brand-600' : 'border-transparent text-ink-muted hover:text-ink')}>{l}</button>
            ))}
          </div>
          {rightTab === 'versions' ? <VersionsPanel modelId={id} versions={versions?.items ?? []} currentId={model.current_version_id} viewingId={viewingParam} onView={viewVersion} onChanged={refresh} />
            : rightTab === 'info' ? <StatsPanel meta={meta} info={info} /> : panelFor(rightTab)}
        </aside>}
      </div>
    </div>
  );

  function panelFor(t: string) {
    switch (t) {
      case 'textures': return <TexturesPanel info={info} meta={meta!} />;
      case 'materials': return <MaterialsPanel info={info} />;
      case 'uv': return <UVPanel info={info} />;
      case 'geometry': return <GeometryPanel meta={meta!} />;
      case 'lod': return <LODPanel versions={versions?.items ?? []} onView={viewVersion} viewingId={viewingParam} />;
      case 'skeleton': return <SkeletonPanel info={info} />;
      case 'animation': return <AnimationPanel info={info} />;
      case 'compare': return <VersionsPanel modelId={id} versions={versions?.items ?? []} currentId={meta!.model.current_version_id} viewingId={viewingParam} onView={viewVersion} onChanged={refresh} />;
      default: {
        const extra = extraTabContent(t, { model: meta!.model, meta: meta!, info, onChanged: refresh });
        return extra ?? <StatsPanel meta={meta!} info={info} />;
      }
    }
  }
}
