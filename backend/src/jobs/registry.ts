import type { Job } from 'bullmq';
type Fn = (job: Job) => Promise<unknown>;
/** Job processors by queue and job name. Populated in worker.ts (and by later milestones). */
export const processorRegistry: Record<'ai' | 'photogrammetry' | 'processing' | 'export', Record<string, Fn>> = { ai: {}, photogrammetry: {}, processing: {}, export: {} };
