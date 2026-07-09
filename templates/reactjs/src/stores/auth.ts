import { AuthModel } from "@/services/auth/auth";
import { getAccessToken } from "@/services/core";
import { create } from "zustand";
import type { AuthUser } from "@/services/auth/types/auth";

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setUser: (user: AuthUser | null) => void;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Session store. The persisted access token (localStorage) is the synchronous
 * source of truth the route guard reads via `getState()`, so navigation can be
 * decided before the async profile fetch resolves. `user` is loaded lazily by
 * `hydrate()` on boot and set directly on a successful login.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: Boolean(getAccessToken()),
  hydrated: false,

  setUser: (user) => set({ user, isAuthenticated: Boolean(user) || Boolean(getAccessToken()) }),

  hydrate: async () => {
    if (!getAccessToken()) {
      set({ hydrated: true });
      return;
    }
    try {
      const user = await AuthModel.getMe();
      set({ user, isAuthenticated: true, hydrated: true });
    } catch {
      // Token is missing/expired — drop it so the guard routes to /login.
      await AuthModel.logout().catch(() => {});
      set({ user: null, isAuthenticated: false, hydrated: true });
    }
  },

  logout: async () => {
    await AuthModel.logout().catch(() => {});
    set({ user: null, isAuthenticated: false });
  },
}));
