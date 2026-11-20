import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, ScanLine, ArrowRight, FolderOpen, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea, FieldError } from '@/components/ui/input';
import { PageHeader, Callout } from '@/components/ui/misc';
import { useProjects, useInvalidate } from '@/hooks/queries';
import { http, errorMessage } from '@/services/api';
import { ASSET_CATEGORIES, CATEGORY_LABELS, type AssetCategory, type Project } from '@/types/api';
import { cn } from '@/utils/cn';

export default function CreatePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const inv = useInvalidate();
  const [mode, setMode] = useState<'ai' | 'photogrammetry'>(params.get('mode') === 'photogrammetry' ? 'photogrammetry' : 'ai');
  const [target, setTarget] = useState<'new' | 'existing'>(params.get('upload') ? 'existing' : 'new');
  const [name, setName] = useState(''); const [category, setCategory] = useState<AssetCategory>('custom'); const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const { data: projects } = useProjects({ page_size: 100, sort: 'updated' });

  async function go() {
    setError(null); setLoading(true);
    try {
      let id = projectId;
      if (target === 'new') {
        const p = await http.post<Project>('/projects', { name: name.trim(), category, description: description.trim() || null });
        id = p.id; await inv('projects', 'dashboard');
      }
      nav(`/app/projects/${id}/studio?mode=${mode}`);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }

  const modes = [
    { id: 'ai' as const, icon: Sparkles, title: 'AI Reconstruction', sub: 'Meshy / Tripo', body: 'Fast generation from 1–4 clean images. Geometry for unseen areas is estimated by the model.', bullets: ['1 image, or up to 4 views on multi-view endpoints', 'Texture & PBR where supported', 'Minutes per model'] },
    { id: 'photogrammetry' as const, icon: ScanLine, title: 'Precision Reconstruction', sub: 'Photogrammetry (COLMAP)', body: 'Triangulates real surface points from many overlapping photos. Supports real-world scale calibration.', bullets: ['20+ overlapping photos recommended', 'Camera poses, reprojection error, point counts', 'Known-dimension scale calibration'] },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Create 3D Model" description="Choose a reconstruction mode and a project. You will upload reference images and configure generation next." />
      <ol className="mb-8 flex flex-wrap items-center gap-2 text-[13px] font-semibold" aria-label="Steps">
        {['Project & Mode', 'Upload Images', 'Configure', 'Process', 'Refine & Export'].map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn('grid size-6 place-items-center rounded-full text-xs', i === 0 ? 'bg-brand text-white' : 'border border-line bg-surface text-ink-muted')}>{i + 1}</span>
            <span className={i === 0 ? 'text-brand-600' : 'text-ink-muted'}>{s}</span>
            {i < 4 && <span className="mx-1 hidden h-px w-8 bg-line sm:block" aria-hidden />}
          </li>
        ))}
      </ol>

      <h2 className="mb-3 text-[15px] font-semibold">Reconstruction mode</h2>
      <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Reconstruction mode">
        {modes.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}
            className={cn('surface relative p-5 text-left transition-shadow hover:shadow-raised', mode === m.id && 'border-brand ring-1 ring-brand')}>
            {mode === m.id && <span className="absolute right-4 top-4 grid size-5 place-items-center rounded-full bg-brand text-white"><Check className="size-3" /></span>}
            <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand"><m.icon className="size-5" /></span>
            <p className="mt-3 text-[15px] font-semibold">{m.title}</p><p className="text-xs font-medium text-brand-600">{m.sub}</p>
            <p className="mt-2 text-[13px] text-ink-muted">{m.body}</p>
            <ul className="mt-3 space-y-1">{m.bullets.map((b) => <li key={b} className="flex gap-2 text-xs text-ink-muted"><Check className="mt-0.5 size-3.5 text-success" />{b}</li>)}</ul>
          </button>
        ))}
      </div>

      <div className="surface mt-6 p-5">
        <div className="mb-4 flex gap-2" role="tablist">
          <Button role="tab" aria-selected={target === 'new'} variant={target === 'new' ? 'soft' : 'ghost'} size="sm" onClick={() => setTarget('new')}>New project</Button>
          <Button role="tab" aria-selected={target === 'existing'} variant={target === 'existing' ? 'soft' : 'ghost'} size="sm" onClick={() => setTarget('existing')}><FolderOpen /> Existing project</Button>
        </div>
        {target === 'new' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="c-name">Project name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lion Statue" maxLength={120} /></div>
            <div><Label htmlFor="c-cat">Asset type</Label><Select id="c-cat" value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>{ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</Select></div>
            <div className="md:col-span-2"><Label htmlFor="c-desc">Description <span className="font-normal text-ink-muted">(optional)</span></Label><Textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[64px]" /></div>
          </div>
        ) : (
          <div><Label htmlFor="c-proj">Project</Label>
            <Select id="c-proj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>{projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.image_count} images)</option>)}
            </Select></div>
        )}
        {mode === 'photogrammetry' && <Callout tone="info" className="mt-4">Photogrammetry needs overlapping photos of the same object taken from many positions. See the <a href="/docs#capture" className="font-semibold underline">capture guide</a>.</Callout>}
        <FieldError>{error}</FieldError>
        <div className="mt-5 flex justify-end">
          <Button onClick={go} loading={loading} disabled={target === 'new' ? !name.trim() : !projectId}>Continue to upload <ArrowRight /></Button>
        </div>
      </div>
    </div>
  );
}
