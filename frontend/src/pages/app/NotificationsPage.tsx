import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/misc';
import { useNotifications, useInvalidate } from '@/hooks/queries';
import { http } from '@/services/api';
import { relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const inv = useInvalidate();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" description="Job results, exports and team activity."
        actions={<Button variant="secondary" size="sm" disabled={!data?.unread} onClick={async () => { await http.post('/notifications/read-all'); await inv('notifications'); }}><CheckCheck /> Mark all read</Button>} />
      {isLoading ? <Skeleton className="h-64" /> : !data?.items.length ? <EmptyState icon={<Bell />} title="You're all caught up" description="Notifications about generations, refinements and exports appear here." /> : (
        <ul className="surface divide-y divide-line">
          {data.items.map((n) => (
            <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.read_at && 'bg-brand-50/40')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand')} aria-hidden />
              <div className="min-w-0 flex-1">
                {n.link ? <Link to={n.link} onClick={() => !n.read_at && http.post(`/notifications/${n.id}/read`).then(() => inv('notifications'))} className="text-[13.5px] font-semibold hover:text-brand-600">{n.title}</Link> : <p className="text-[13.5px] font-semibold">{n.title}</p>}
                {n.body && <p className="text-[13px] text-ink-muted">{n.body}</p>}
                <p className="mt-0.5 text-xs text-ink-subtle">{relativeTime(n.created_at)}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Delete notification" onClick={async () => { await http.del(`/notifications/${n.id}`); await inv('notifications'); }}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
