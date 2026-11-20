import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { PageHeader, StatCard, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Coins, HardDrive, CalendarDays } from 'lucide-react';
import { useMe, useInvalidate } from '@/hooks/queries';
import { http, errorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types/api';
import { formatBytes, formatDate } from '@/utils/format';

export default function ProfilePage() {
  const { data: me } = useMe(); const inv = useInvalidate(); const setUser = useAuthStore((s) => s.setUser);
  const [f, setF] = useState({ full_name: '', company: '', job_title: '', avatar_url: '' }); const [saving, setSaving] = useState(false);
  useEffect(() => { if (me) setF({ full_name: me.full_name ?? '', company: me.company ?? '', job_title: (me as User & { job_title?: string }).job_title ?? '', avatar_url: me.avatar_url ?? '' }); }, [me]);
  if (!me) return <Skeleton className="h-96" />;
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try { const u = await http.patch<User>('/auth/me', { full_name: f.full_name || null, company: f.company || null, job_title: f.job_title || null, avatar_url: f.avatar_url || null }); setUser(u); await inv('me'); toast.success('Profile saved'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setSaving(false); }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile" description={me.email} actions={<Badge tone="brand" className="capitalize">{me.plan} plan</Badge>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Coins />} label="Credits" value={me.credits} />
        <StatCard icon={<HardDrive />} label="Storage" value={formatBytes(me.storage_used_bytes)} hint={`of ${formatBytes(me.storage_quota_bytes, 0)}`} />
        <StatCard icon={<CalendarDays />} label="Member since" value={formatDate(me.created_at)} />
      </div>
      <form onSubmit={save} className="surface grid gap-4 p-5 sm:grid-cols-2">
        <div><Label htmlFor="pf-n">Full name</Label><Input id="pf-n" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
        <div><Label htmlFor="pf-e">Email</Label><Input id="pf-e" value={me.email} disabled /></div>
        <div><Label htmlFor="pf-c">Company</Label><Input id="pf-c" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
        <div><Label htmlFor="pf-j">Job title</Label><Input id="pf-j" value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="pf-a">Avatar URL</Label><Input id="pf-a" type="url" value={f.avatar_url} onChange={(e) => setF({ ...f, avatar_url: e.target.value })} placeholder="https://…" /></div>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={saving}>Save profile</Button></div>
      </form>
    </div>
  );
}
