import { create } from 'zustand';
import type { User, PublicProfile } from '@tennis/shared';

interface AppStore {
  user: PublicProfile | User | null;
  divisionId: string | null;
  setUser: (user: PublicProfile | User | null) => void;
  setDivisionId: (id: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  divisionId: null,
  setUser: (user) => set({ user, divisionId: user?.divisionId ?? null }),
  setDivisionId: (divisionId) => set({ divisionId }),
}));
