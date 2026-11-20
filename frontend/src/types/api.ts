// API contract shared conceptually with backend/src/types. Keep in sync.

export type Plan = 'free' | 'pro' | 'studio';
export interface User {
  id: string; email: string; full_name: string | null; avatar_url: string | null; company: string | null;
  plan: Plan; credits: number; storage_used_bytes: number; storage_quota_bytes: number; created_at: string;
  preferences: Record<string, unknown>;
}

export const ASSET_CATEGORIES = [
  'human', 'animal', 'creature', 'vehicle', 'building', 'furniture', 'product', 'mechanical', 'game_prop', 'environment', 'custom',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  human: 'Human / Character', animal: 'Animal', creature: 'Monster / Creature', vehicle: 'Vehicle', building: 'Building / Architecture',
  furniture: 'Furniture', product: 'Consumer Product', mechanical: 'Mechanical Object', game_prop: 'Game Weapon / Prop', environment: 'Environment Asset', custom: 'Custom Object',
};

export const ANGLES = ['front', 'back', 'left', 'right', 'front_left', 'front_right', 'back_left', 'back_right', 'top', 'bottom', 'custom'] as const;
export type Angle = (typeof ANGLES)[number];

export interface Paginated<T> { items: T[]; total: number; page: number; page_size: number }

export interface Project {
  id: string; name: string; description: string | null; category: AssetCategory; status: 'draft' | 'processing' | 'completed' | 'failed';
  cover_url: string | null; image_count: number; model_count: number; generation_count: number; team_id: string | null;
  owner_id: string; created_at: string; updated_at: string;
}

export interface ImageQuality {
  width: number; height: number; megapixels: number; blur_score: number; is_blurry: boolean; brightness: number; contrast: number;
  exposure: 'under' | 'ok' | 'over'; resolution_ok: boolean; aspect_ratio: number; warnings: string[];
}
export interface ProjectImage {
  id: string; project_id: string; angle: Angle; custom_label: string | null; original_name: string; mime_type: string; size_bytes: number;
  width: number; height: number; sha256: string; sort_order: number; quality: ImageQuality | null; url: string; thumb_url: string; created_at: string;
}

export interface DatasetAnalysis {
  image_count: number;
  coverage: { angle: Angle; present: boolean; image_ids: string[] }[];
  coverage_ratio: number; // fraction of the 10 canonical angles that have at least one image
  missing_angles: Angle[];
  duplicates: { a: string; b: string; distance: number; exact: boolean }[];
  blurry_image_ids: string[];
  low_resolution_image_ids: string[];
  lighting: { mean_brightness: number; stddev_brightness: number; consistent: boolean };
  similarity: { method: string; mean: number; outlier_image_ids: string[]; note: string };
  overlap: null | { method: string; pairs_checked: number; mean_inlier_matches: number; weakly_connected_image_ids: string[]; suitable_for_photogrammetry: boolean; computed_at: string };
  recommendations: string[];
}

export type GenerationMode = 'ai' | 'photogrammetry';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface GenerationEvent { at: string; stage: string; message: string; level: 'info' | 'warning' | 'error'; data?: Record<string, unknown> }

export interface Generation {
  id: string; project_id: string; project_name?: string; mode: GenerationMode; provider: string; status: JobStatus; stage: string | null;
  progress: number | null; progress_source: string | null; settings: GenerationSettings; input_image_ids: string[]; used_image_ids: string[];
  error: string | null; model_id: string | null; credits_charged: number; is_demo: boolean; provider_task_id: string | null;
  events: GenerationEvent[]; metrics: Record<string, unknown>; created_at: string; started_at: string | null; completed_at: string | null;
}

export interface GenerationSettings {
  category: AssetCategory; quality: 'draft' | 'standard' | 'high' | 'ultra'; polygon_level: 'low' | 'medium' | 'high' | 'custom';
  target_polycount?: number; texture_resolution: 'none' | '1k' | '2k' | '4k' | '8k'; pbr: boolean; topology?: 'triangle' | 'quad';
  remesh?: boolean; rig?: boolean; symmetry?: 'off' | 'auto' | 'on'; texture_prompt?: string;
  // photogrammetry
  known_dimension?: { axis: 'x' | 'y' | 'z' | 'longest'; value: number; unit: 'mm' | 'cm' | 'm' | 'in' };
  matcher?: 'exhaustive' | 'sequential'; max_image_size?: number;
}

export interface ProviderInfo {
  id: string; name: string; configured: boolean; is_demo: boolean; status: 'available' | 'configuration_required';
  capabilities: {
    modes: ('single_image' | 'multi_image')[]; max_images: number; multiview_angles?: Angle[]; quality_levels: string[]; texture_resolutions: string[];
    supports_pbr: boolean; supports_polycount: boolean; polycount_range?: [number, number]; supports_topology: boolean; supports_remesh: boolean;
    supports_rigging: boolean; supports_symmetry: boolean; supports_texture_prompt: boolean; output_formats: string[]; notes: string[];
  };
  credit_cost: Record<string, number>;
}

export interface ModelStats {
  vertices: number; triangles: number; faces: number; meshes: number; materials: number; textures: { name: string; width: number; height: number; mime: string }[];
  max_texture_resolution: number | null; has_uvs: boolean; has_normals: boolean; has_vertex_colors: boolean; has_skin: boolean; bone_count: number;
  animations: number; bbox_min: [number, number, number]; bbox_max: [number, number, number]; dimensions: [number, number, number];
  unit: string; scale_calibrated: boolean; file_size: number; format: string;
}

export interface Model {
  id: string; project_id: string; project_name?: string; generation_id: string | null; name: string; category: AssetCategory;
  source: 'ai' | 'photogrammetry' | 'upload'; provider: string | null; is_demo: boolean; status: 'processing' | 'ready' | 'failed';
  current_version_id: string | null; current_version: number | null; favorite: boolean; tags: string[]; folder_id: string | null;
  thumbnail_url: string | null; stats: ModelStats | null; game_ready: boolean; created_at: string; updated_at: string;
}

export interface ModelVersion {
  id: string; model_id: string; version: number; label: string; operation: string; parent_version_id: string | null; params: Record<string, unknown>;
  file_url: string; file_size: number; stats: ModelStats | null; is_lod: boolean; lod_level: number | null; created_at: string;
}

export interface ValidationCheck { id: string; group: string; label: string; status: 'pass' | 'warn' | 'fail' | 'not_applicable' | 'not_available'; value: string | number | null; detail: string; method: string }
export interface ValidationReport {
  id: string; model_id: string; version_id: string; created_at: string; summary: { pass: number; warn: number; fail: number; not_available: number };
  checks: ValidationCheck[];
  metrics: {
    reference_coverage: number | null; reconstruction_confidence: string | null; geometric_deviation: number | null;
    texture_quality: string | null; model_integrity: string | null; silhouette_iou: Record<string, number> | null;
  };
  limitations: string[];
}

export interface ProcessingJob {
  id: string; model_id: string; kind: 'analyze' | 'validate' | 'refine' | 'optimize' | 'lod'; status: JobStatus; params: Record<string, unknown>;
  result_version_id: string | null; error: string | null; created_at: string; completed_at: string | null;
}

export interface ExportJob {
  id: string; model_id: string; model_name?: string; version_id: string; preset: string; formats: string[]; settings: ExportSettings; status: JobStatus;
  stage: string | null; error: string | null; files: { name: string; format: string; size: number; validated: boolean; validation: string }[];
  package_size: number | null; download_url: string | null; created_at: string; completed_at: string | null;
}
export interface ExportSettings {
  scale: number; units: 'm' | 'cm' | 'mm'; up_axis: 'Y' | 'Z'; forward_axis: '-Z' | 'Z' | 'Y' | '-Y' | 'X' | '-X'; texture_resolution: 'original' | '1k' | '2k' | '4k';
  include_textures: boolean; include_materials: boolean; include_normals: boolean; include_uvs: boolean; include_skeleton: boolean;
  include_animation: boolean; include_collision: boolean; lods: number[]; triangulate: boolean;
}

export interface Notification { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface CreditTransaction { id: string; amount: number; reason: string; reference_type: string | null; reference_id: string | null; created_at: string; balance_after?: number }
export interface Folder { id: string; name: string; model_count: number; created_at: string }
export interface Team { id: string; name: string; owner_id: string; role: 'owner' | 'admin' | 'member'; members: TeamMember[] }
export interface TeamMember { id: string; user_id: string | null; email: string; full_name: string | null; role: 'owner' | 'admin' | 'member'; status: 'active' | 'invited'; created_at: string }

export interface DashboardSummary {
  totals: { projects: number; models: number; processing_jobs: number; exports: number; storage_used_bytes: number; storage_quota_bytes: number; credits: number };
  recent_projects: Project[]; recent_generations: Generation[];
}

export interface SystemStatus {
  auth_mode: 'local' | 'supabase'; storage_driver: string; demo_mode: boolean; payments_enabled: boolean;
  tools: { colmap: { available: boolean; version: string | null; cuda: boolean }; blender: { available: boolean; version: string | null }; python: { available: boolean } };
  providers: ProviderInfo[];
}
