import { Link } from 'react-router-dom';
import { Box, Layers, Loader, HardDrive, Download, Plus, Upload, Crosshair, Library, ArrowRight, History } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { StatCard, ProgressBar, Skeleton, EmptyState } from '@/components/ui/misc';
import { ProjectsBrowser } from '@/components/projects/ProjectsBrowser';
import { GenerationRow } from '@/components/GenerationRow';
import { useDashboard, useMe } from '@/hooks/queries';
import { formatBytes, formatNumber } from '@/utils/format';

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data, isLoading } = useDashboard();
  const t = data?.totals;
  const first = me?.full_name?.split(' ')[0];
  const quick = [
    { to: '/app/create', icon: Plus, title: 'Create New Model', body: 'Start a project and choose AI or photogrammetry' },
    { to: '/app/create?upload=1', icon: Upload, title: 'Upload Images', body: 'Add multi-view photos to a project' },
    { to: '/app/precision', icon: Crosshair, title: 'Start Precision Scan', body: 'COLMAP reconstruction with real scale' },
    { to: '/app/library', icon: Library, title: 'Open Asset Library', body: 'Browse, organise and download models' },
  ];
  const usedPct = t && t.storage_quota_bytes ? (t.storage_used_bytes / t.storage_quota_bytes) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome to Vistora 3D{first ? `, ${first}` : ''}</h1>
          <p className="mt-1 text-sm text-ink-muted">From Every Angle to Every Detail.</p>
        </div>
        <Link to="/app/create" className={buttonVariants()}><Plus /> Create New Model</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {isLoading || !t ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px]" />) : (
          <>
            <StatCard icon={<Box />} label="Total Projects" value={formatNumber(t.projects)} />
            <StatCard icon={<Layers />} label="Generated Models" value={formatNumber(t.models)} />
            <StatCard icon={<Loader />} label="Processing Jobs" value={formatNumber(t.processing_jobs)} hint={t.processing_jobs ? 'In progress' : 'Nothing running'} />
            <StatCard icon={<HardDrive />} label="Storage Usage" value={formatBytes(t.storage_used_bytes)}
              hint={<span className="block w-32"><span className="block">of {formatBytes(t.storage_quota_bytes, 0)}</span><ProgressBar value={usedPct} className="mt-1.5" label="Storage used" /></span>} />
            <StatCard icon={<Download />} label="Exported Assets" value={formatNumber(t.exports)} />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quick.map((q) => (
          <Link key={q.title} to={q.to} className="surface group flex items-center gap-3 p-4 transition-shadow hover:shadow-raised">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-lavender text-brand"><q.icon className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{q.title}</span><span className="block truncate text-xs text-ink-muted">{q.body}</span></span>
            <ArrowRight className="size-4 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[1fr_380px]">
        <ProjectsBrowser title="Recent Projects" pageSize={5} compact />
        <section className="surface p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Recent Generations</h2><Link to="/app/history" className="text-xs font-semibold text-brand-600 hover:underline">View all</Link></div>
          {isLoading ? <Skeleton className="h-40" /> : data?.recent_generations.length ? (
            <div className="-mx-2">{data.recent_generations.map((g) => <GenerationRow key={g.id} g={g} />)}</div>
          ) : (
            <EmptyState className="border-0 py-8" icon={<History />} title="No generations yet" description="Generations and reconstructions you start appear here with their real status." />
          )}
        </section>
      </div>
    </div>
  );
}
