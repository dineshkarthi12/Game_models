import { meshy } from './meshy.js';
import { tripo } from './tripo.js';
import { demo } from './demo.js';
import type { AIProvider } from './types.js';
import { generationCost } from '../services/plans.js';

export const providers: Record<string, AIProvider> = { meshy, tripo, demo };
export function getProvider(id: string): AIProvider | null { return providers[id] ?? null; }

export function providerInfo() {
  return Object.values(providers)
    .filter((p) => !p.isDemo || p.configured())
    .map((p) => ({
      id: p.id, name: p.name, configured: p.configured(), is_demo: p.isDemo,
      status: p.configured() ? 'available' : 'configuration_required',
      capabilities: p.capabilities,
      credit_cost: Object.fromEntries(['draft', 'standard', 'high', 'ultra'].map((q) => [q, generationCost('ai', q, { demo: p.isDemo })])),
    }));
}
