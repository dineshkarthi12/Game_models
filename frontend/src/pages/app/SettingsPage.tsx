import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Monitor, Trash2, Cpu, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader, Callout, Skeleton, ProgressBar } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog } from '@/components/ui/dialog';
import { Pagination } from '@/components/Pagination';
import { http, errorMessage } from '@/services/api';
import { authService, validatePassword } from '@/services/auth';
import { useMe, useInvalidate } from '@/hooks/queries';
import { useAuthStore } from '@/stores/auth';
import type { CreditTransaction, Paginated, SystemStatus, User } from '@/types/api';
import { formatBytes, formatDateTime, relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'general';
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="Preferences, security, plan and system status." />
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
        <TabsList>{[['general', 'General'], ['security', 'Security'], ['billing', 'Plan & credits'], ['system', 'System status'], ['account', 'Account']].map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList>
        <TabsContent value="general" className="pt-5"><General /></TabsContent>
        <TabsContent value="security" className="pt-5"><Security /></TabsContent>
        <TabsContent value="billing" className="pt-5"><Billing /></TabsContent>
        <TabsContent value="system" className="pt-5"><System /></TabsContent>
        <TabsContent value="account" className="pt-5"><Account /></TabsContent>
      </Tabs>
    </div>
  );
}

function General() {
  const { data: me } = useMe(); const setUser = useAuthStore((s) => s.setUser); const inv = useInvalidate();
  const prefs = (me?.preferences ?? {}) as { units?: string; default_quality?: string; default_export?: string; email_notifications?: boolean };
  async function save(p: Record<string, unknown>) { try { const u = await http.patch<User>('/auth/me', { preferences: p }); setUser(u); await inv('me'); toast.success('Saved'); } catch (e) { toast.error(errorMessage(e)); } }
  if (!me) return <Skeleton className="h-40" />;
  return (
    <div className="surface grid gap-4 p-5 sm:grid-cols-3">
      <div><Label htmlFor="pu">Display units</Label><Select id="pu" defaultValue={prefs.units ?? 'cm'} onChange={(e) => save({ units: e.target.value })}><option value="mm">Millimetres</option><option value="cm">Centimetres</option><option value="m">Metres</option><option value="in">Inches</option></Select></div>
      <div><Label htmlFor="pq">Default generation quality</Label><Select id="pq" defaultValue={prefs.default_quality ?? 'standard'} onChange={(e) => save({ default_quality: e.target.value })}><option value="draft">Draft</option><option value="standard">Standard</option><option value="high">High Detail</option><option value="ultra">Ultra</option></Select></div>
      <div><Label htmlFor="pe">Default export target</Label><Select id="pe" defaultValue={prefs.default_export ?? 'blender'} onChange={(e) => save({ default_export: e.target.value })}>{['blender', 'maya', 'unreal', 'unity', 'godot', 'universal'].map((x) => <option key={x}>{x}</option>)}</Select></div>
    </div>
  );
}

function Security() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['sessions'], queryFn: () => http.get<{ items: { id: string; user_agent: string | null; ip: string | null; created_at: string; last_seen_at: string; current: boolean }[] }>('/auth/sessions'), enabled: authService.mode === 'local' });
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  async function change(e: FormEvent) {
    e.preventDefault(); const v = validatePassword(pw); if (v) return toast.error(v);
    setBusy(true); try { await http.post('/auth/change-password', { current_password: cur, new_password: pw }); setCur(''); setPw(''); toast.success('Password changed; other sessions were signed out'); await qc.invalidateQueries({ queryKey: ['sessions'] }); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }
  if (authService.mode === 'supabase') return <Callout tone="info">Passwords and sessions are managed by Supabase Auth for this deployment.</Callout>;
  return (
    <div className="space-y-5">
      <form onSubmit={change} className="surface grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><Label htmlFor="cp">Current password</Label><Input id="cp" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <Button type="submit" loading={busy} disabled={!cur || !pw}>Change password</Button>
      </form>
      <section className="surface">
        <h2 className="border-b border-line px-5 py-3 text-[15px] font-semibold">Active sessions</h2>
        <ul className="divide-y divide-line">{data?.items.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
            <Monitor className="size-4 text-ink-muted" />
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{s.user_agent ?? 'Unknown device'}</p><p className="text-xs text-ink-muted">{s.ip} · signed in {formatDateTime(s.created_at)} · active {relativeTime(s.last_seen_at)}</p></div>
            {s.current ? <Badge tone="success">This device</Badge> : <Button size="sm" variant="secondary" onClick={async () => { await http.del(`/auth/sessions/${s.id}`); await qc.invalidateQueries({ queryKey: ['sessions'] }); }}>Sign out</Button>}
          </li>))}</ul>
      </section>
    </div>
  );
}

interface Billing { subscription: { plan: string; status: string; provider: string | null } | null; balance: number; storage: { storage_used_bytes: number; storage_quota_bytes: number }; payments_enabled: boolean;
  plans: { id: string; name: string; price_usd_month: number; monthly_credits: number; storage_quota_bytes: number; features: string[] }[] }
function Billing() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['billing'], queryFn: () => http.get<Billing>('/billing') });
  const { data: tx } = useQuery({ queryKey: ['billing-tx', page], queryFn: () => http.get<Paginated<CreditTransaction>>(`/billing/transactions?page=${page}&page_size=15`) });
  if (!data) return <Skeleton className="h-64" />;
  const plan = data.subscription?.plan ?? 'free';
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface p-5"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Credit balance</p><p className="mt-1 text-3xl font-bold tabular-nums">{data.balance}</p><p className="text-xs text-ink-muted">Failed or cancelled jobs are refunded automatically.</p></div>
        <div className="surface p-5"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Storage</p><p className="mt-1 text-xl font-bold">{formatBytes(data.storage.storage_used_bytes)} <span className="text-sm font-medium text-ink-muted">of {formatBytes(data.storage.storage_quota_bytes, 0)}</span></p>
          <ProgressBar className="mt-2" value={(data.storage.storage_used_bytes / data.storage.storage_quota_bytes) * 100} label="Storage used" /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((p) => (
          <div key={p.id} className={cn('surface flex flex-col p-5', plan === p.id && 'border-brand ring-1 ring-brand')}>
            <div className="flex items-center justify-between"><h3 className="font-bold">{p.name}</h3>{plan === p.id && <Badge tone="brand">Current</Badge>}</div>
            <p className="mt-2"><span className="text-2xl font-extrabold">${p.price_usd_month}</span><span className="text-xs text-ink-muted"> / month</span></p>
            <ul className="mt-3 flex-1 space-y-1.5 text-[13px]">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-3.5 text-success" />{f}</li>)}</ul>
            {plan !== p.id && p.id !== 'free' && <Button className="mt-4" variant="secondary" onClick={async () => { try { await http.post('/billing/checkout', { plan: p.id }); } catch (e) { toast.error(errorMessage(e)); } }}>Upgrade to {p.name}</Button>}
          </div>
        ))}
      </div>
      {!data.payments_enabled && <Callout tone="warning">Online payments are not configured for this deployment. Plans can be changed by an administrator.</Callout>}
      <section className="surface">
        <h2 className="border-b border-line px-5 py-3 text-[15px] font-semibold">Credit ledger</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[13px]"><thead className="text-xs text-ink-muted"><tr><th className="px-5 py-2">Date</th><th className="px-5 py-2">Description</th><th className="px-5 py-2 text-right">Amount</th><th className="px-5 py-2 text-right">Balance</th></tr></thead>
          <tbody className="divide-y divide-line">{tx?.items.map((t) => (
            <tr key={t.id}><td className="px-5 py-2 text-ink-muted">{formatDateTime(t.created_at)}</td><td className="px-5 py-2">{t.reason}</td>
              <td className={cn('px-5 py-2 text-right font-semibold tabular-nums', t.amount > 0 ? 'text-success' : 'text-ink')}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td><td className="px-5 py-2 text-right tabular-nums">{t.balance_after}</td></tr>))}</tbody></table></div>
        {tx && <div className="px-5 pb-3"><Pagination page={page} pageSize={15} total={tx.total} onPage={setPage} /></div>}
      </section>
    </div>
  );
}

interface Metrics { workers: { worker: string; host: string; at: string; cpus: number; load: number[]; system_memory: { total: number; free: number }; process_rss: number; gpus: { name: string; utilization: number }[]; uptime_s: number }[];
  queues: Record<string, Record<string, number>> }
function System() {
  const { data: sys } = useQuery({ queryKey: ['system'], queryFn: () => http.get<SystemStatus>('/system/status') });
  const { data: m } = useQuery({ queryKey: ['metrics'], queryFn: () => http.get<Metrics>('/system/metrics'), refetchInterval: 10_000 });
  if (!sys) return <Skeleton className="h-64" />;
  const row = (k: string, v: React.ReactNode, ok?: boolean) => <div key={k} className="flex items-center justify-between py-1.5 text-[13px]"><span className="text-ink-muted">{k}</span><span className="flex items-center gap-2 font-semibold">{v}{ok !== undefined && <span className={cn('size-2 rounded-full', ok ? 'bg-success' : 'bg-warning')} />}</span></div>;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="surface p-5"><h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Server className="size-4 text-brand" /> Services</h2>
        {row('Authentication', sys.auth_mode === 'local' ? 'Local (JWT)' : 'Supabase', true)}{row('Storage', sys.storage_driver === 'local' ? 'Local disk (signed URLs)' : 'S3 / R2', true)}
        {row('COLMAP', sys.tools.colmap.available ? `v${sys.tools.colmap.version}${sys.tools.colmap.cuda ? ' · CUDA' : ' · CPU only'}` : 'missing', sys.tools.colmap.available)}
        {row('Blender', sys.tools.blender.available ? `v${sys.tools.blender.version}` : 'missing', sys.tools.blender.available)}{row('Python processing', sys.tools.python.available ? 'ready' : 'missing', sys.tools.python.available)}
        {sys.providers.map((p) => row(p.name, p.status === 'available' ? 'configured' : 'configuration required', p.status === 'available'))}
        {row('Payments', 'not configured', false)}</section>
      <section className="surface p-5"><h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Cpu className="size-4 text-brand" /> Workers & queues</h2>
        {!m?.workers.length ? <Callout tone="warning">No worker heartbeat in the last minute. Start one with <code className="kbd">npm run dev:worker</code>.</Callout> : m.workers.map((w) => (
          <div key={w.worker} className="mb-3 rounded-lg bg-canvas p-3 text-xs">
            <p className="font-semibold">{w.host} · pid {w.worker.split('-').pop()}</p>
            <p className="text-ink-muted">{w.cpus} CPUs · load {w.load.map((x) => x.toFixed(2)).join(' / ')} · RAM {formatBytes(w.system_memory.total - w.system_memory.free)} of {formatBytes(w.system_memory.total)} · worker RSS {formatBytes(w.process_rss)}</p>
            <p className="text-ink-muted">GPU: {w.gpus.length ? w.gpus.map((g) => `${g.name} ${g.utilization}%`).join(', ') : 'none detected (CPU processing)'} · heartbeat {relativeTime(w.at)}</p>
          </div>))}
        <table className="mt-2 w-full text-xs"><thead className="text-ink-muted"><tr><th className="py-1 text-left">Queue</th><th>Waiting</th><th>Active</th><th>Failed</th><th>Done</th></tr></thead>
          <tbody>{m && Object.entries(m.queues).map(([q, c]) => <tr key={q} className="text-center"><td className="py-1 text-left font-medium">{q}</td><td>{c.waiting}</td><td>{c.active}</td><td>{c.failed}</td><td>{c.completed}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}

function Account() {
  const nav = useNavigate(); const [open, setOpen] = useState(false); const [confirm, setConfirm] = useState('');
  return (
    <section className="surface border-danger/30 p-5">
      <h2 className="text-[15px] font-semibold text-danger">Delete account</h2>
      <p className="mt-1 text-[13px] text-ink-muted">Permanently deletes your account, projects, images, models, exports and credit history.</p>
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}><Trash2 /> Delete my account</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Delete account permanently?" description="Type DELETE to confirm. This cannot be undone."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={confirm !== 'DELETE'} onClick={async () => {
          try { await http.api('/auth/me', { method: 'DELETE', json: { confirm: 'DELETE' } }); await authService.logout(); nav('/'); } catch (e) { toast.error(errorMessage(e)); }
        }}>Delete account</Button></>}>
        <Input aria-label="Type DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Dialog>
    </section>
  );
}
