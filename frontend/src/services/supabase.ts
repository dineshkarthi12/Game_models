import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const authMode: 'local' | 'supabase' =
  import.meta.env.VITE_AUTH_MODE === 'supabase' && import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY ? 'supabase' : 'local';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (authMode !== 'supabase') throw new Error('Supabase auth is not configured');
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!);
  return client;
}
