import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Camera, Cpu, ScanLine, Ruler, Gamepad2, PackageCheck, Layers, Sparkles, ShieldCheck, Upload, Settings2, Eye, Download, Check,
  Boxes, Grid3x3, Scale, Bone,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeroIllustration, CaptureRingIllustration, FacetedModel } from '@/components/brand/Illustrations';
import { http } from '@/services/api';
import { cn } from '@/utils/cn';
import { formatBytes } from '@/utils/format';

export function SectionHeading({ eyebrow, title, description, center = true }: { eyebrow?: string; title: string; description?: string; center?: boolean }) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2 className="mt-3 text-3xl font-bold sm:text-[34px] sm:leading-tight">{title}</h2>
      {description && <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-lavender via-surface to-surface">
      <div className="absolute inset-0 grid-bg opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" aria-hidden />
      <div className="container relative grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <span className="eyebrow"><Sparkles className="size-3.5" /> AI + Photogrammetry</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-[56px]">Transform Real-World Images Into Detailed 3D Models.</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-muted">Reconstruct, refine and export professional 3D assets using AI-powered multi-view reconstruction and photogrammetry workflows.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app/create" className={buttonVariants({ size: 'lg' })}>Create Your 3D Model <ArrowRight /></Link>
            <Link to="/features" className={buttonVariants({ size: 'lg', variant: 'secondary' })}>Explore Features</Link>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[13px] font-medium text-ink">
            {[[Sparkles, 'Multi-View AI'], [ScanLine, 'Photogrammetry'], [Layers, 'High Detail'], [Gamepad2, 'Game Ready']].map(([I, l]) => {
              const Icon = I as typeof Sparkles;
              return <li key={l as string} className="flex items-center gap-2"><Icon className="size-4 text-brand" />{l as string}</li>;
            })}
          </ul>
        </div>
        <HeroIllustration className="mx-auto w-full max-w-[560px]" />
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Upload, title: 'Upload multi-view photos', body: 'Drag in photographs of the same object from front, back, sides, top and diagonals. Assign each angle on the orientation guide.' },
  { icon: ShieldCheck, title: 'Check the reference set', body: 'Blur, exposure, resolution, duplicates and missing views are measured per image. Coverage is reported separately from quality.' },
  { icon: Settings2, title: 'Choose a reconstruction mode', body: 'AI Reconstruction for speed from a few images, or Precision Photogrammetry (COLMAP) for overlapping captures and real scale.' },
  { icon: Eye, title: 'Inspect and validate', body: 'Orbit the real mesh, view wireframe, UVs and textures, and read a measured quality report — not an invented score.' },
  { icon: Download, title: 'Refine and export', body: 'Decimate, retopologise, generate LODs, then export FBX, GLB, OBJ, USD or STL with presets for Blender, Maya, Unreal and Unity.' },
];

export function HowItWorks({ detailed = false }: { detailed?: boolean }) {
  return (
    <section className="container py-20" id="how-it-works">
      <SectionHeading eyebrow="How it works" title="From photographs to production assets in five steps" description="Every stage reports what actually happened: which images were used, which cameras registered, and what the resulting mesh measures." />
      <ol className={cn('mt-12 grid gap-4', detailed ? 'md:grid-cols-1' : 'md:grid-cols-5')}>
        {STEPS.map((s, i) => (
          <li key={s.title} className={cn('surface relative p-5', detailed && 'flex gap-5')}>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand"><s.icon className="size-5" /></span>
              <span className="text-xs font-bold text-ink-subtle">0{i + 1}</span>
            </div>
            <div className={cn(!detailed && 'mt-4')}>
              <h3 className="text-[15px] font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeatureRow({ id, eyebrow, title, body, bullets, visual, flip }: { id: string; eyebrow: string; title: string; body: string; bullets: string[]; visual: React.ReactNode; flip?: boolean }) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 py-14 lg:grid-cols-2">
      <div className={cn(flip && 'lg:order-2')}>
        <span className="eyebrow">{eyebrow}</span>
        <h3 className="mt-3 text-2xl font-bold sm:text-[28px]">{title}</h3>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{body}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b) => <li key={b} className="flex gap-2.5 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{b}</li>)}
        </ul>
      </div>
      <div className={cn('surface overflow-hidden bg-canvas p-6', flip && 'lg:order-1')}>{visual}</div>
    </div>
  );
}

function AngleGridVisual() {
  const angles = ['Front', 'Front Right', 'Right', 'Back Right', 'Back', 'Back Left', 'Left', 'Front Left'];
  return (
    <div className="grid grid-cols-4 gap-3">
      {angles.map((a, i) => (
        <div key={a} className="rounded-lg border border-line bg-surface p-2">
          <div className="grid aspect-square place-items-center rounded-md bg-lavender"><div className="w-3/4"><FacetedModel split={false} segments={10} rotY={(i / 8) * Math.PI * 2} size={120} /></div></div>
          <p className="mt-1.5 truncate text-center text-[11px] font-semibold text-ink-muted">{a}</p>
        </div>
      ))}
    </div>
  );
}

function PipelineVisual() {
  const stages = ['Feature extraction', 'Feature matching', 'Camera poses', 'Sparse point cloud', 'Dense / CPU fallback', 'Mesh', 'Texture', 'Scale calibration'];
  return (
    <ol className="space-y-2">
      {stages.map((s, i) => (
        <li key={s} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] font-medium">
          <span className="grid size-6 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand">{i + 1}</span>{s}
          <span className="ml-auto font-mono text-[11px] text-ink-subtle">COLMAP{i > 5 ? ' + Vistora' : ''}</span>
        </li>
      ))}
    </ol>
  );
}

function ExportVisual() {
  const targets = [['Blender', 'GLB · FBX · OBJ · USD'], ['Autodesk Maya', 'FBX · OBJ · USD'], ['Unreal Engine', 'FBX · USD · GLB'], ['Unity', 'FBX · OBJ · GLB'], ['Godot', 'GLB · GLTF'], ['Universal', 'GLB · GLTF · OBJ · STL']];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {targets.map(([t, f]) => (
        <div key={t} className="rounded-lg border border-line bg-surface p-3">
          <PackageCheck className="size-5 text-brand" /><p className="mt-2 text-[13px] font-semibold">{t}</p><p className="mt-0.5 text-[11px] text-ink-muted">{f}</p>
        </div>
      ))}
    </div>
  );
}

function GameVisual() {
  const lods = [['LOD0', '100%'], ['LOD1', '50%'], ['LOD2', '25%'], ['LOD3', '10%']];
  return (
    <div className="grid grid-cols-4 gap-3">
      {lods.map(([l, p], i) => (
        <div key={l} className="rounded-lg border border-line bg-surface p-2 text-center">
          <FacetedModel segments={[18, 12, 8, 5][i]} split size={120} />
          <p className="text-[12px] font-semibold">{l}</p><p className="text-[11px] text-ink-muted">{p} triangles</p>
        </div>
      ))}
    </div>
  );
}

function PrecisionVisual() {
  const rows = [['Registered cameras', 'from COLMAP'], ['Mean reprojection error', 'pixels, from SfM'], ['Known dimension', 'you provide'], ['Scale factor', 'computed'], ['Bounding box', 'measured in mm/cm/m']];
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
      <CaptureRingIllustration />
      <dl className="space-y-2 self-center">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"><dt className="font-medium">{k}</dt><dd className="text-ink-muted">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

export function FeatureRows() {
  return (
    <section className="container divide-y divide-line" id="features">
      <FeatureRow id="ai" eyebrow="Multi-View AI Reconstruction" title="Fast 3D from a handful of photos"
        body="Send your best reference views to Meshy or Tripo. Vistora shows exactly which images each provider accepts and records which ones were actually used — never more than the API supports."
        bullets={['Single-image and multi-view endpoints, chosen per provider capability', 'Texture, PBR, polycount and topology options only where the provider supports them', 'Real provider task status — no simulated progress']}
        visual={<AngleGridVisual />} />
      <FeatureRow id="photogrammetry" flip eyebrow="Precision Photogrammetry" title="Measured geometry from overlapping captures"
        body="A separate COLMAP Structure-from-Motion pipeline recovers camera poses and a point cloud from your overlapping photographs, then meshes and textures the result on background workers."
        bullets={['Feature extraction, matching, mapping and meshing on workers, never in the browser', 'Per-stage metrics: registered cameras, points, reprojection error', 'GPU dense MVS where CUDA exists; documented CPU fallback otherwise']}
        visual={<PipelineVisual />} />
      <FeatureRow id="precision" eyebrow="Precision Modeling" title="Real-world scale you can verify"
        body="Calibrate scale from a known dimension and compare the model's bounding box with the measurements you provide. Validation reports state the method and limits of every number."
        bullets={['Known-dimension scale calibration', 'Bounding-box and measurement deviation checks', 'Reference coverage reported separately from reconstruction quality']}
        visual={<PrecisionVisual />} />
      <FeatureRow id="game" flip eyebrow="Game-Ready Assets" title="Optimised for real-time engines"
        body="Reduce polygon counts to a budget, remesh, unwrap UVs, generate LOD chains and collision meshes, and check the result before it is marked game-ready."
        bullets={['Polygon budgets with quadric decimation', 'Voxel remesh, UV unwrap and LOD0–LOD3', 'Engine presets for Unreal, Unity and Godot']}
        visual={<GameVisual />} />
      <FeatureRow id="export" eyebrow="Professional Export" title="Open in the tools you already use"
        body="Exports are produced by Blender's native exporters and re-imported for validation before a download link is issued. Files are never renamed to imitate another format."
        bullets={['FBX, GLB, GLTF, OBJ, USD, USDZ and STL', 'Axis, unit, scale and LOD settings per target', 'ZIP packages with textures, metadata and README']}
        visual={<ExportVisual />} />
    </section>
  );
}

export function CapabilityGrid() {
  const items = [
    [Camera, 'Multi-view upload studio', 'Angle assignment, previews, reordering and per-image quality metrics.'],
    [ScanLine, 'COLMAP photogrammetry', 'Structure-from-Motion with meshing and photo-projected textures.'],
    [Cpu, 'Background processing', 'Redis + BullMQ queues with retries, cancellation and logs.'],
    [Grid3x3, 'Advanced 3D viewer', 'Wireframe, textures, materials, UV maps, skeleton and animation.'],
    [Ruler, 'Validation engine', 'Manifold checks, normals, silhouettes and dimension deviation.'],
    [Boxes, 'Version history', 'Every refinement creates a new version you can compare and restore.'],
    [Scale, 'Scale calibration', 'Known dimensions turn relative reconstructions into real units.'],
    [Bone, 'Rigging where supported', 'Provider rigging for humanoid characters when the API offers it.'],
  ] as const;
  return (
    <section className="bg-canvas py-20">
      <div className="container">
        <SectionHeading eyebrow="Platform" title="Everything between the camera and the engine" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([I, t, d]) => (
            <div key={t} className="surface p-5"><I className="size-5 text-brand" /><h3 className="mt-3 text-[15px] font-semibold">{t}</h3><p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{d}</p></div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface PlanInfo { id: string; name: string; price_usd_month: number; monthly_credits: number; storage_quota_bytes: number; features: string[] }
export function Pricing() {
  const { data, isError } = useQuery({ queryKey: ['plans'], queryFn: () => http.get<{ plans: PlanInfo[]; payments_enabled: boolean }>('/plans') });
  return (
    <section className="container py-20" id="pricing">
      <SectionHeading eyebrow="Pricing" title="Plans that scale with your pipeline" description="Credits are charged per generation and refunded automatically if a job fails." />
      {isError && <p className="mt-8 text-center text-sm text-danger">Pricing could not be loaded. Please try again later.</p>}
      <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
        {(data?.plans ?? []).map((p) => {
          const featured = p.id === 'pro';
          return (
            <div key={p.id} className={cn('surface flex flex-col p-6', featured && 'border-brand ring-1 ring-brand')}>
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{p.name}</h3>{featured && <Badge tone="brand">Most popular</Badge>}</div>
              <p className="mt-4"><span className="text-4xl font-extrabold">${p.price_usd_month}</span><span className="text-sm text-ink-muted"> / month</span></p>
              <p className="mt-1 text-[13px] text-ink-muted">{p.monthly_credits} credits / month · {formatBytes(p.storage_quota_bytes, 0)} storage</p>
              <ul className="mt-6 flex-1 space-y-2.5">{p.features.map((f) => <li key={f} className="flex gap-2.5 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{f}</li>)}</ul>
              <Link to={p.id === 'free' ? '/register' : '/app/settings?tab=billing'} className={cn(buttonVariants({ variant: featured ? 'primary' : 'secondary' }), 'mt-6 w-full')}>
                {p.id === 'free' ? 'Start free' : `Choose ${p.name}`}
              </Link>
            </div>
          );
        })}
      </div>
      {data && !data.payments_enabled && <p className="mt-6 text-center text-xs text-ink-muted">Online payments are not yet enabled for this deployment. Paid plans can be activated by an administrator.</p>}
    </section>
  );
}

const FAQ = [
  ['How accurate are the models?', 'Accuracy depends on your photographs, the object\'s surface and the reconstruction mode. Vistora never promises a percentage. After processing you get measured metrics — registered cameras, reprojection error, mesh integrity, silhouette overlap and dimension deviation where you supplied measurements.'],
  ['What is the difference between AI and photogrammetry?', 'AI reconstruction estimates geometry from one or a few images and fills unseen areas plausibly. Photogrammetry triangulates real surface points from many overlapping photographs and can be scaled to real units. Results are labelled with their source.'],
  ['How many photos do I need?', 'AI providers accept 1–4 images depending on the endpoint. Photogrammetry typically needs 20–80 sharp photos with 60–80% overlap between neighbours, captured in rings around the object.'],
  ['Which objects are difficult?', 'Reflective, transparent and featureless surfaces confuse feature matching. Use cross-polarised or diffuse lighting, a matte scanning spray, or add textured markers around the object.'],
  ['Which formats can I export?', 'FBX, GLB, GLTF, OBJ, USD, USDZ and STL, produced by Blender\'s native exporters and validated by re-import before download.'],
  ['What happens to credits if a job fails?', 'Failed or cancelled jobs are refunded automatically, exactly once. The credit ledger is visible in Settings → Billing.'],
];
export function Faq() {
  return (
    <section className="container py-20" id="faq">
      <SectionHeading eyebrow="FAQ" title="Questions, answered honestly" />
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-line rounded-xl border border-line bg-surface">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold">{q}<span className="text-xl leading-none text-ink-muted transition-transform group-open:rotate-45" aria-hidden>+</span></summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="container pb-20">
      <div className="relative overflow-hidden rounded-2xl bg-ink px-8 py-12 text-white sm:px-12">
        <div className="relative max-w-xl">
          <h2 className="text-3xl font-bold text-white">Start with the photos you already have.</h2>
          <p className="mt-3 text-[15px] text-white/70">Create a project, upload your views and see measured results — free plan included.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/register" className={buttonVariants({ size: 'lg' })}>Get Started <ArrowRight /></Link>
            <Link to="/docs" className={cn(buttonVariants({ size: 'lg', variant: 'ghost' }), 'text-white hover:bg-white/10 hover:text-white')}>Read the capture guide</Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-6 bottom-0 hidden w-72 opacity-90 md:block" aria-hidden><FacetedModel /></div>
      </div>
    </section>
  );
}
