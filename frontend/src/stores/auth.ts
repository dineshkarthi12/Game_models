import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authMode, supabase } from '@/services/supabase';
import type { User } from '@/types/api';

interface AuthState {
  token: string | null;
  user: User | null;
  setSession: (token: string | null, user: User | null) => void;
  setUser: (user: User) => void;
  getAccessToken: () => Promise<string | null>;
  handleUnauthorized: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      getAccessToken: async () => {
        if (authMode === 'supabase') {
          const { data } = await supabase().auth.getSession();
          return data.session?.access_token ?? null;
        }
        return get().token;
      },
      handleUnauthorized: () => { if (get().token || get().user) set({ token: null, user: null }); },
      logout: async () => {
        if (authMode === 'supabase') await supabase().auth.signOut();
        set({ token: null, user: null });
      },
    }),
    { name: 'vistora-auth', partialize: (s) => ({ token: s.token, user: s.user }) },
  ),
);
