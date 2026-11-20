export type ProviderId = 'meshy' | 'tripo' | 'demo';
export type ProviderStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ProviderCapabilities {
  modes: ('single_image' | 'multi_image')[];
  max_images: number;
  multiview_angles?: string[];
  quality_levels: string[];
  texture_resolutions: string[];
  supports_pbr: boolean;
  supports_polycount: boolean;
  polycount_range?: [number, number];
  supports_topology: boolean;
  supports_remesh: boolean;
  supports_rigging: boolean;
  supports_symmetry: boolean;
  supports_texture_prompt: boolean;
  output_formats: string[];
  notes: string[];
}

export interface InputImage { id: string; path: string; mime: string; angle: string; width: number; height: number; quality?: { is_blurry?: boolean; blur_score?: number } | null }

export interface GenerationSettings {
  category: string; quality: 'draft' | 'standard' | 'high' | 'ultra'; polygon_level: 'low' | 'medium' | 'high' | 'custom'; target_polycount?: number;
  texture_resolution: 'none' | '1k' | '2k' | '4k' | '8k'; pbr: boolean; topology?: 'triangle' | 'quad'; remesh?: boolean; rig?: boolean;
  symmetry?: 'off' | 'auto' | 'on'; texture_prompt?: string;
}

export interface TaskState {
  status: ProviderStatus;
  /** Provider-reported progress (0–100) or null when the provider does not report it. */
  progress: number | null;
  stage?: string;
  error?: string;
  /** Download URLs reported by the provider. */
  outputs?: { glb?: string; fbx?: string; obj?: string; usdz?: string; thumbnail?: string; [k: string]: string | undefined };
  raw?: unknown;
}

export interface CreatedTask { taskId: string; request: Record<string, unknown>; endpoint: string }

export interface AIProvider {
  id: ProviderId;
  name: string;
  isDemo: boolean;
  configured(): boolean;
  capabilities: ProviderCapabilities;
  /** Pick the images actually sent to the provider (never more than the endpoint accepts). */
  selectInputs(images: InputImage[]): { selected: InputImage[]; reason: string };
  createTask(images: InputImage[], settings: GenerationSettings, ctx: { workDir: string }): Promise<CreatedTask>;
  getTask(taskId: string, endpoint: string): Promise<TaskState>;
  cancelTask?(taskId: string, endpoint: string): Promise<void>;
  /** Optional rigging step for supported assets; returns a new task id. */
  createRigTask?(sourceTaskId: string, settings: GenerationSettings): Promise<CreatedTask>;
}

export class ProviderError extends Error {
  constructor(public provider: string, message: string, public status?: number, public retryable = false) { super(message); }
}

/** Shared selection: prefer canonical views in a fixed priority, skip blurry images when alternatives exist. */
export function rankImages(images: InputImage[], priority: string[]): InputImage[] {
  const score = (i: InputImage) => {
    const p = priority.indexOf(i.angle); return (p < 0 ? 100 : p) + (i.quality?.is_blurry ? 50 : 0);
  };
  return [...images].sort((a, b) => score(a) - score(b) || (b.width * b.height) - (a.width * a.height));
}

export const POLYCOUNT: Record<string, number> = { low: 10_000, medium: 50_000, high: 150_000 };
