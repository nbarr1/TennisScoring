import { create } from 'zustand';
import type { User } from '@tennis/shared';

interface AppStore {
  user: User | null;
  divisionId: string | null;
  setUser: (user: User | null) => void;
  setDivisionId: (id: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  divisionId: null,
  setUser: (user) => set({ user, divisionId: user?.divisionId ?? null }),
  setDivisionId: (divisionId) => set({ divisionId }),
}));
