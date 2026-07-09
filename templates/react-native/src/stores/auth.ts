import { AuthModel } from "@/services/auth";
import { getAccessToken } from "@/services/core/auth-token-storage";
import { create } from "zustand";
import type { AuthUser } from "@/services/auth/types/auth";

interface AuthState {
  /** Signed-in user, or null when logged out / not yet hydrated. */
  user: AuthUser | null;
  /** True while a session (access token + user) is active. */
  isAuthenticated: boolean;
  /** False until the boot-time SecureStore check finishes — the auth gate shows a
   * splash while false so it never flashes `/login` before the token is read. */
  hydrated: boolean;
  setUser: (user: AuthUser | null) => void;
  /** Boot-time restore: read the persisted token, resolve the user, mark hydrated. */
  hydrate: () => Promise<void>;
  /** Sign out: hit the logout endpoint, clear SecureStore + reset state. */
  logout: () => Promise<void>;
}

/**
 * Zustand auth store — the app's session source of truth. The auth-gated route
 * group reads `isAuthenticated`/`hydrated`; the injected `onSessionExpired`
 * callback (wired in the root layout) resets it on an unrecoverable 401.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  hydrated: false,

  setUser: (user) => set({ user, isAuthenticated: Boolean(user) }),

  hydrate: async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        set({ user: null, isAuthenticated: false, hydrated: true });
        return;
      }
      // Token present — resolve the user. A stale token 401s here; the interceptor
      // refreshes if it can, otherwise onSessionExpired resets us to logged out.
      const user = await AuthModel.getMe();
      set({ user, isAuthenticated: true, hydrated: true });
    } catch {
      set({ user: null, isAuthenticated: false, hydrated: true });
    }
  },

  logout: async () => {
    try {
      await AuthModel.logout();
    } catch {
      // Ignore network errors — tokens are cleared by the model regardless.
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
