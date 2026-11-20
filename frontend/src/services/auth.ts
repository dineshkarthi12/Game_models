import { http } from '@/services/api';
import { authMode, supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types/api';

async function finishSupabase() {
  const me = await http.get<User>('/auth/me');
  useAuthStore.getState().setSession(null, me);
  return me;
}

export const authService = {
  mode: authMode,
  async login(email: string, password: string) {
    if (authMode === 'supabase') {
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return finishSupabase();
    }
    const r = await http.post<{ token: string; user: User }>('/auth/login', { email, password });
    useAuthStore.getState().setSession(r.token, r.user);
    return r.user;
  },
  async register(email: string, password: string, full_name: string) {
    if (authMode === 'supabase') {
      const { data, error } = await supabase().auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: `${location.origin}/app` } });
      if (error) throw error;
      if (!data.session) return null; // email confirmation required
      const me = await finishSupabase();
      await http.patch('/auth/me', { full_name });
      return me;
    }
    const r = await http.post<{ token: string; user: User }>('/auth/register', { email, password, full_name });
    useAuthStore.getState().setSession(r.token, r.user);
    return r.user;
  },
  async google() {
    const { error } = await supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) throw error;
  },
  async completeOAuth() { return finishSupabase(); },
  async forgot(email: string) {
    if (authMode === 'supabase') {
      const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
      if (error) throw error;
      return;
    }
    await http.post('/auth/forgot-password', { email });
  },
  async reset(token: string | null, password: string) {
    if (authMode === 'supabase') {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) throw error;
      return;
    }
    await http.post('/auth/reset-password', { token, password });
  },
  async logout() {
    if (authMode === 'local') await http.post('/auth/logout').catch(() => {});
    await useAuthStore.getState().logout();
  },
};

export function validatePassword(p: string): string | null {
  if (p.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Include both letters and numbers';
  return null;
}
