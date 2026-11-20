import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, UserPlus, Trash2, Lock, Share2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader, EmptyState, Callout, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { http, errorMessage } from '@/services/api';
import { useMe, useProjects } from '@/hooks/queries';
import { formatDate } from '@/utils/format';

interface Team { id: string; name: string; owner_id: string; role: string; members: { id: string; email: string; full_name: string | null; role: string; status: string; user_id: string | null }[]; projects: { id: string; name: string; updated_at: string }[] }

export default function TeamPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({ queryKey: ['teams'], queryFn: () => http.get<{ items: Team[] }>('/teams') });
  const { data: projects } = useProjects({ page_size: 100 });
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [role, setRole] = useState('member'); const [share, setShare] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['teams'] });
  const canCreate = me?.plan === 'studio';
  const team = data?.items[0];
  const own = team && team.owner_id === me?.id;

  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Team Workspace" description="Share projects and models with collaborators. Access is enforced by row-level security in the database." />
      {!team ? (
        <div className="surface p-6">
          {canCreate ? (
            <form className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end" onSubmit={async (e) => { e.preventDefault(); try { await http.post('/teams', { name }); await refresh(); toast.success('Team created'); } catch (err) { toast.error(errorMessage(err)); } }}>
              <div className="flex-1"><Label htmlFor="tn">Team name</Label><Input id="tn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asset Studio" /></div>
              <Button type="submit" disabled={name.trim().length < 2}><Users /> Create team</Button>
            </form>
          ) : (
            <EmptyState icon={<Lock />} title="Team workspaces are part of the Studio plan" description="Upgrade to share projects, invite collaborators and review models together. If someone invites you, their team appears here automatically."
              action={<Link to="/app/settings?tab=billing" className={buttonVariants({ size: 'sm' })}>View plans</Link>} />
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-[15px] font-semibold">{team.name}</h2><Badge tone="brand" className="capitalize">{team.role}</Badge></div>
            <ul className="divide-y divide-line">
              {team.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="grid size-9 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{(m.full_name || m.email)[0]!.toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.full_name || m.email}</p><p className="truncate text-xs text-ink-muted">{m.email}</p></div>
                  <Badge className="capitalize">{m.role}</Badge>{m.status === 'invited' && <Badge tone="warning">Invited</Badge>}
                  {own && m.role !== 'owner' && <Button variant="danger-ghost" size="icon-sm" aria-label={`Remove ${m.email}`} onClick={async () => { await http.del(`/teams/${team.id}/members/${m.id}`); await refresh(); }}><Trash2 /></Button>}
                </li>
              ))}
            </ul>
            {own && (
              <form className="flex flex-col gap-2 border-t border-line p-5 sm:flex-row sm:items-end" onSubmit={async (e) => { e.preventDefault(); try { await http.post(`/teams/${team.id}/invites`, { email, role }); setEmail(''); await refresh(); toast.success('Invitation sent'); } catch (err) { toast.error(errorMessage(err)); } }}>
                <div className="flex-1"><Label htmlFor="inv">Invite by email</Label><Input id="inv" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@studio.com" /></div>
                <Select aria-label="Role" className="sm:w-32" value={role} onChange={(e) => setRole(e.target.value)}><option value="member">Member</option><option value="admin">Admin</option></Select>
                <Button type="submit" disabled={!email}><UserPlus /> Invite</Button>
              </form>
            )}
          </section>
          <section className="surface p-5">
            <h2 className="text-[15px] font-semibold">Shared projects</h2>
            <p className="mt-1 text-xs text-ink-muted">Members can view shared projects and their models; only owners can delete them.</p>
            <ul className="mt-3 space-y-2">{team.projects.map((p) => <li key={p.id} className="flex justify-between rounded-lg border border-line px-3 py-2 text-[13px]"><Link to={`/app/projects/${p.id}`} className="font-semibold hover:text-brand-600">{p.name}</Link><span className="text-xs text-ink-muted">{formatDate(p.updated_at)}</span></li>)}
              {!team.projects.length && <li className="text-[13px] text-ink-muted">No shared projects yet.</li>}</ul>
            <div className="mt-4 flex gap-2">
              <Select aria-label="Project to share" value={share} onChange={(e) => setShare(e.target.value)}><option value="">Share one of your projects…</option>{projects?.items.filter((p) => p.owner_id === me?.id && !p.team_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              <Button disabled={!share} onClick={async () => { try { await http.put(`/projects/${share}/team`, { team_id: team.id }); setShare(''); await refresh(); toast.success('Project shared'); } catch (err) { toast.error(errorMessage(err)); } }}><Share2 /> Share</Button>
            </div>
          </section>
        </div>
      )}
      {!canCreate && team && <Callout tone="info" className="mt-4">You are a member of a team owned by another account.</Callout>}
    </div>
  );
}
