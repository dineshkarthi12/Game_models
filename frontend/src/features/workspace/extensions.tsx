import type { LucideIcon } from 'lucide-react';
import type { Model } from '@/types/api';
import type { SceneInfo } from '@/viewer/inspect';
import type { ModelMetadata } from './hooks';

/** Extension points filled by later milestones (validation, refinement, optimisation, export). */
export const ExtraTabs: { id: string; label: string; icon: LucideIcon; mode: string }[] = [];
export function WorkspaceActions(_: { model: Model }) { return null; }
export function extraTabContent(_t: string, _ctx: { model: Model; meta: ModelMetadata; info: SceneInfo | null; onChanged: () => void }): React.ReactNode | null { return null; }
