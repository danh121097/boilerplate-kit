import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { getAccessToken, getSessionEpoch } from "@/services/core/auth-token-storage";
import { RefreshRejectedError } from "@/services/core/refresh-errors";
import { create } from "zustand";
import type { AuthUser } from "@/services/auth/types/auth";

interface AuthState {
  /** Signed-in user, or null when logged out / not yet resolved. May be null
   * while authenticated if the profile fetch failed transiently (see `loadUser`). */
  user: AuthUser | null;
  /** True while a session (stored tokens) is active. */
  isAuthenticated: boolean;
  /** False until the boot-time SecureStore check finishes — the auth gate shows a
   * splash while false so it never flashes `/login` before the token is read. */
  hydrated: boolean;
  /** True after an involuntary sign-out (session expired): the auth gate then
   * sends the user to /login with a `returnTo` of the screen they were on. */
  sessionExpired: boolean;
  /** Reset auth state after an unrecoverable 401 / rejected refresh. */
  expireSession: () => void;
  setUser: (user: AuthUser | null) => void;
  /** Boot-time restore: read the persisted token, resolve the user, mark hydrated. */
  hydrate: () => Promise<void>;
  /** (Re)fetch the signed-in user. Safe to call again after a transient failure. */
  loadUser: () => Promise<void>;
  /** Sign out: revoke server-side, clear SecureStore + query cache, reset state. */
  logout: () => Promise<void>;
}

/** Did this failure end the session (vs. offline / 5xx / 429 / timeout)? */
function isSessionEnding(error: unknown): boolean {
  if (error instanceof RefreshRejectedError) return true;
  const code = (error as { error_code?: unknown } | null)?.error_code;
  return code === 401;
}

/**
 * Zustand auth store — the app's session source of truth. The auth-gated route
 * group reads `isAuthenticated`/`hydrated`; the injected `onSessionExpired`
 * callback (wired in the root layout) resets it on an unrecoverable 401.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  hydrated: false,
  sessionExpired: false,

  expireSession: () => set({ user: null, isAuthenticated: false, sessionExpired: true }),

  setUser: (user) => set({ user, isAuthenticated: Boolean(user), sessionExpired: false }),

  hydrate: async () => {
    const token = await getAccessToken().catch(() => null);
    if (!token) {
      set({ user: null, isAuthenticated: false, hydrated: true });
      return;
    }
    // Token present — resolve the user. A stale token 401s here; the interceptor
    // refreshes if it can. Only a session-ending failure (tokens cleared) logs out.
    await get().loadUser();
    set({ hydrated: true });
  },

  loadUser: async () => {
    // A logout / expiry while getMe is in flight bumps the epoch; a late result
    // (success or failure) must not resurrect or rewrite that ended session.
    const epoch = getSessionEpoch();
    const isStale = () => getSessionEpoch() !== epoch;
    try {
      const user = await AuthModel.getMe();
      if (isStale()) return;
      set({ user, isAuthenticated: true });
    } catch (error) {
      // Offline / 5xx / 429 / timeout keep the tokens: stay signed in with an
      // unknown user and let the UI retry. Logged out only when the session ended.
      const stillHasToken = Boolean(await getAccessToken().catch(() => null));
      if (isStale()) return;
      if (isSessionEnding(error) || !stillHasToken) {
        set({ user: null, isAuthenticated: false });
      } else {
        set({ isAuthenticated: true });
      }
    }
  },

  logout: async () => {
    try {
      await AuthModel.logout();
    } catch {
      // Ignore network errors — tokens are cleared by the model regardless.
    } finally {
      queryClient.clear();
      set({ user: null, isAuthenticated: false, sessionExpired: false });
    }
  },
}));
