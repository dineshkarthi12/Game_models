import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type {
  DashboardSummary, Folder, Generation, Model, Notification, Paginated, Project, User,
} from '@/types/api';

export const qk = {
  me: ['me'] as const,
  notifications: ['notifications'] as const,
  dashboard: ['dashboard'] as const,
  projects: (params: string) => ['projects', params] as const,
  project: (id: string) => ['project', id] as const,
  models: (params: string) => ['models', params] as const,
  model: (id: string) => ['model', id] as const,
  folders: ['folders'] as const,
  tags: ['tags'] as const,
  generations: (params: string) => ['generations', params] as const,
  generation: (id: string) => ['generation', id] as const,
};

export const toQuery = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
};

export function useMe() {
  const hasUser = useAuthStore((s) => !!s.user);
  return useQuery({ queryKey: qk.me, queryFn: () => http.get<User>('/auth/me'), enabled: hasUser, staleTime: 15_000 });
}

export function useNotifications() {
  const hasUser = useAuthStore((s) => !!s.user);
  return useQuery({ queryKey: qk.notifications, queryFn: () => http.get<{ items: Notification[]; unread: number }>('/notifications'), enabled: hasUser, refetchInterval: 20_000 });
}

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard, queryFn: () => http.get<DashboardSummary>('/dashboard'),
    refetchInterval: (q) => ((q.state.data?.totals.processing_jobs ?? 0) > 0 ? 5000 : false),
  });
}

export function useProjects(params: Record<string, string | number | undefined>) {
  const qs = toQuery(params);
  return useQuery({ queryKey: qk.projects(qs), queryFn: () => http.get<Paginated<Project>>(`/projects?${qs}`), placeholderData: keepPreviousData });
}
export function useProject(id: string | undefined) {
  return useQuery({ queryKey: qk.project(id ?? ''), queryFn: () => http.get<Project>(`/projects/${id}`), enabled: !!id });
}

export function useModels(params: Record<string, string | number | undefined>, opts: { enabled?: boolean } = {}) {
  const qs = toQuery(params);
  return useQuery({
    queryKey: qk.models(qs), queryFn: () => http.get<Paginated<Model>>(`/models?${qs}`), placeholderData: keepPreviousData, enabled: opts.enabled ?? true,
    refetchInterval: (q) => (q.state.data?.items.some((m) => m.status === 'processing') ? 5000 : false),
  });
}
export function useModel(id: string | undefined) {
  return useQuery({
    queryKey: qk.model(id ?? ''), queryFn: () => http.get<Model>(`/models/${id}`), enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 4000 : false),
  });
}
export function useFolders() { return useQuery({ queryKey: qk.folders, queryFn: () => http.get<{ items: Folder[] }>('/folders') }); }
export function useTags() { return useQuery({ queryKey: qk.tags, queryFn: () => http.get<{ items: { tag: string; count: number }[] }>('/tags') }); }

export function useGenerations(params: Record<string, string | number | undefined>) {
  const qs = toQuery(params);
  return useQuery({
    queryKey: qk.generations(qs), queryFn: () => http.get<Paginated<Generation>>(`/generations?${qs}`), placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((g) => g.status === 'queued' || g.status === 'running') ? 4000 : false),
  });
}

/** Invalidate everything list-like after a mutation. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...roots: string[]) => Promise.all(roots.map((r) => qc.invalidateQueries({ queryKey: [r] })));
}

export function useUpdateModel() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; favorite?: boolean; folder_id?: string | null; tags?: string[] }) => http.patch<Model>(`/models/${id}`, body),
    onSuccess: () => inv('models', 'model', 'folders', 'tags', 'dashboard'),
  });
}
