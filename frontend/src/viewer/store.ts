import { create } from 'zustand';

export type ViewMode = 'shaded' | 'wireframe' | 'clay' | 'normals' | 'uv';
export type ViewDir = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso';
export type Background = 'light' | 'white' | 'dark';
export type Lighting = 'studio' | 'soft' | 'dramatic';

interface ViewerState {
  mode: ViewMode; autoRotate: boolean; grid: boolean; background: Background; lighting: Lighting;
  showPointCloud: boolean; showCameras: boolean; viewRequest: { dir: ViewDir; nonce: number } | null;
  clip: string | null; playing: boolean; showSkeleton: boolean;
  set: (p: Partial<Omit<ViewerState, 'set' | 'requestView'>>) => void;
  requestView: (dir: ViewDir) => void;
}

export const useViewer = create<ViewerState>((set) => ({
  mode: 'shaded', autoRotate: false, grid: true, background: 'light', lighting: 'studio',
  showPointCloud: false, showCameras: false, viewRequest: null, clip: null, playing: false, showSkeleton: false,
  set: (p) => set(p),
  requestView: (dir) => set({ viewRequest: { dir, nonce: Date.now() } }),
}));

/** Shared camera pose for synchronised side-by-side comparison. */
export const cameraSync = { position: null as [number, number, number] | null, target: null as [number, number, number] | null, source: '' };
