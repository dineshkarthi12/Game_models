import { useQuery } from '@tanstack/react-query';
import { http } from '@/services/api';
import type { Model, ModelStats, ModelVersion } from '@/types/api';

export interface Integrity {
  welded_vertices: number; edges: number; boundary_edges: number; non_manifold_edges: number; degenerate_faces: number; duplicate_faces: number;
  watertight: boolean; winding_consistent: boolean; components: number; euler_number: number; surface_area: number; volume: number | null;
}
export interface ModelMetadata {
  model: Model; version: ModelVersion | null; stats: (ModelStats & { integrity?: Integrity; animation_names?: string[]; generator?: string }) | null;
  textures: { name: string; map_type: string | null; width: number; height: number; mime_type: string }[];
  source: null | { mode: 'ai' | 'photogrammetry'; provider: string; settings: Record<string, unknown>; metrics: Record<string, unknown>; used_images: number; input_images: number;
    created_at: string; completed_at: string | null; point_cloud_url: string | null; cameras_url: string | null; log_url: string | null };
}
export function useModelMetadata(id: string, versionId?: string | null) {
  return useQuery({ queryKey: ['model-metadata', id, versionId ?? 'current'], queryFn: () => http.get<ModelMetadata>(`/models/${id}/metadata${versionId ? `?version_id=${versionId}` : ''}`), enabled: !!id,
    refetchInterval: (q) => (q.state.data?.model.status === 'processing' ? 3000 : false) });
}
export function useVersions(id: string) {
  return useQuery({ queryKey: ['model-versions', id], queryFn: () => http.get<{ items: ModelVersion[] }>(`/models/${id}/versions`), enabled: !!id });
}
