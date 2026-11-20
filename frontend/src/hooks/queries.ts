import { useQuery } from '@tanstack/react-query';
import { http } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { Notification, User } from '@/types/api';

export const qk = {
  me: ['me'] as const,
  notifications: ['notifications'] as const,
};

export function useMe() {
  const hasUser = useAuthStore((s) => !!s.user);
  return useQuery({ queryKey: qk.me, queryFn: () => http.get<User>('/auth/me'), enabled: hasUser, staleTime: 30_000 });
}

export function useNotifications() {
  const hasUser = useAuthStore((s) => !!s.user);
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => http.get<{ items: Notification[]; unread: number }>('/notifications'),
    enabled: hasUser,
    refetchInterval: 30_000,
  });
}
