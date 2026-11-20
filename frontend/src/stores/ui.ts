import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  libraryView: 'grid' | 'list';
  toggleSidebar: () => void;
  setMobileNav: (o: boolean) => void;
  setLibraryView: (v: 'grid' | 'list') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      libraryView: 'grid',
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (o) => set({ mobileNavOpen: o }),
      setLibraryView: (v) => set({ libraryView: v }),
    }),
    { name: 'vistora-ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, libraryView: s.libraryView }) },
  ),
);
