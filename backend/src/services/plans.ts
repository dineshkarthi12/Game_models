export type Plan = 'free' | 'pro' | 'studio';
export const PLANS: Record<Plan, {
  name: string; price_usd_month: number; monthly_credits: number; signup_credits: number; storage_quota_bytes: number;
  qualities: string[]; max_texture: string; team_workspace: boolean; priority_processing: boolean; features: string[];
}> = {
  free: {
    name: 'Free', price_usd_month: 0, monthly_credits: 60, signup_credits: 60, storage_quota_bytes: 2 * 1024 ** 3,
    qualities: ['draft', 'standard'], max_texture: '2k', team_workspace: false, priority_processing: false,
    features: ['Limited generations each month', 'Draft & Standard quality', '2 GB storage', 'GLB / OBJ / FBX / USD export'],
  },
  pro: {
    name: 'Pro', price_usd_month: 29, monthly_credits: 600, signup_credits: 0, storage_quota_bytes: 50 * 1024 ** 3,
    qualities: ['draft', 'standard', 'high', 'ultra'], max_texture: '4k', team_workspace: false, priority_processing: true,
    features: ['Higher generation limits', 'High & Ultra detail', '50 GB storage', 'Priority processing where available', 'Game-asset optimisation'],
  },
  studio: {
    name: 'Studio', price_usd_month: 99, monthly_credits: 2000, signup_credits: 0, storage_quota_bytes: 250 * 1024 ** 3,
    qualities: ['draft', 'standard', 'high', 'ultra'], max_texture: '8k', team_workspace: true, priority_processing: true,
    features: ['Team workspace & shared projects', '250 GB storage', 'Advanced processing', 'Everything in Pro'],
  },
};

/** Credit cost of a generation. Photogrammetry runs on our own workers; AI cost mirrors provider spend. */
export function generationCost(mode: 'ai' | 'photogrammetry', quality: string, opts: { demo?: boolean; rig?: boolean; pbr?: boolean } = {}): number {
  if (opts.demo) return 0;
  if (mode === 'photogrammetry') return { draft: 8, standard: 12, high: 18, ultra: 25 }[quality] ?? 12;
  let c = { draft: 5, standard: 10, high: 20, ultra: 30 }[quality] ?? 10;
  if (opts.pbr) c += 5;
  if (opts.rig) c += 5;
  return c;
}
