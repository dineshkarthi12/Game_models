import { useState } from 'react';
import { Box, Layers, Upload, Sparkles, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Label, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Callout, Segmented, StatCard, ProgressBar, Skeleton, EmptyState, PageHeader } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Logo, LogoMark } from '@/components/brand/Logo';
import { FacetedModel } from '@/components/brand/Illustrations';

const COLORS = [
  ['Primary Purple', '#6844F5'], ['Secondary Blue', '#4C8DFF'], ['Background', '#F7F8FC'], ['Surface', '#FFFFFF'],
  ['Primary Text', '#18213B'], ['Secondary Text', '#69738A'], ['Border', '#E7EAF2'], ['Success', '#16A36A'], ['Warning', '#E9A23B'], ['Error', '#DC5555'],
];

export default function DesignSystemPage() {
  const [q, setQ] = useState<'draft' | 'standard' | 'high' | 'ultra'>('high');
  const [sw, setSw] = useState(true);
  return (
    <div className="container py-12">
      <PageHeader title="Vistora 3D Design System" description="Tokens, typography and components used across the product." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><div><CardTitle>Brand</CardTitle><CardDescription>Geometric V mark — two receding planes and an inner depth facet.</CardDescription></div></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-8"><Logo /><LogoMark className="h-12" /><div className="w-28"><FacetedModel /></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Colour</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {COLORS.map(([n, c]) => (<div key={n}><div className="h-12 rounded-lg border border-line" style={{ background: c }} /><p className="mt-1.5 text-xs font-semibold">{n}</p><p className="font-mono text-[11px] text-ink-muted">{c}</p></div>))}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Typography — Inter</CardTitle></CardHeader>
          <CardContent className="space-y-2"><p className="text-4xl font-bold tracking-tight">Display 36 / Bold</p><p className="text-2xl font-bold">Heading 24 / Bold</p><p className="text-[15px] font-semibold">Title 15 / Semibold</p><p className="text-sm">Body 14 — Reconstruct, refine and export professional 3D assets.</p><p className="text-xs text-ink-muted">Caption 12 / Secondary</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Buttons & badges</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2"><Button><Sparkles /> Primary</Button><Button variant="secondary">Secondary</Button><Button variant="soft">Soft</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button loading>Saving</Button></div>
            <div className="flex flex-wrap gap-2"><StatusBadge status="completed" /><StatusBadge status="processing" /><StatusBadge status="queued" /><StatusBadge status="failed" /><Badge tone="warning">Demo output</Badge><Badge tone="blue">Photogrammetry</Badge></div>
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Form controls</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="ds-name">Project name</Label><Input id="ds-name" placeholder="Lion statue" /></div>
            <div><Label htmlFor="ds-cat">Asset type</Label><Select id="ds-cat"><option>Sculpture / Object</option><option>Vehicle</option></Select></div>
            <div className="sm:col-span-2"><Label htmlFor="ds-desc">Description</Label><Textarea id="ds-desc" placeholder="Notes about the capture…" /></div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-6"><Segmented ariaLabel="Quality" value={q} onChange={setQ} options={[{ value: 'draft', label: 'Draft' }, { value: 'standard', label: 'Standard' }, { value: 'high', label: 'High Detail' }, { value: 'ultra', label: 'Ultra' }]} />
              <label className="flex items-center gap-2 text-[13px]"><Switch checked={sw} onCheckedChange={setSw} label="Auto rotate" /> Auto rotate</label><Checkbox label="Include textures" defaultChecked /></div>
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Feedback</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Callout tone="info" icon={<Info />} title="Reference coverage is not accuracy">Coverage reports which angles you captured. Reconstruction quality is measured after processing.</Callout>
            <Callout tone="warning" icon={<AlertTriangle />} title="Demo output">This model was generated procedurally and is not reconstructed from your photos.</Callout>
            <div><p className="mb-1 text-xs text-ink-muted">Upload progress (measured bytes)</p><ProgressBar value={64} label="Upload progress" /></div>
            <Skeleton className="h-8 w-1/2" />
          </CardContent></Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4">
          <StatCard icon={<Box />} label="Total Projects" value="—" hint="Live values on the dashboard" />
          <StatCard icon={<Layers />} label="Generated Models" value="—" />
          <StatCard icon={<Upload />} label="Images" value="—" />
          <StatCard icon={<Sparkles />} label="Credits" value="—" />
        </div>
        <Card className="lg:col-span-2"><CardContent>
          <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">3D Preview</TabsTrigger><TabsTrigger value="b">Wireframe</TabsTrigger><TabsTrigger value="c">Textures</TabsTrigger></TabsList>
            <TabsContent value="a" className="pt-4"><EmptyState icon={<Box />} title="No models yet" description="Upload multi-view photographs to create your first model." action={<Button size="sm">Create model</Button>} /></TabsContent>
            <TabsContent value="b" className="pt-4 text-sm text-ink-muted">Wireframe tab content</TabsContent>
            <TabsContent value="c" className="pt-4 text-sm text-ink-muted">Textures tab content</TabsContent>
          </Tabs></CardContent></Card>
      </div>
    </div>
  );
}
