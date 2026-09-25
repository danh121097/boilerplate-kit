import { STORAGE_KEYS } from "@/enums";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth/auth";
import {
  getAccessToken,
  getRefreshToken,
  isUnauthorizedError,
  onSessionEnded,
  resetQueriesOnSessionEnd,
  resyncQueriesAfterLogin,
  syncAuthAcrossTabs,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
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
  isAuthenticated: hasStoredSession(),
  hydrated: false,

  setUser: (user) => set({ user, isAuthenticated: Boolean(user) || hasStoredSession() }),

  hydrate: async () => {
    if (!hasStoredSession()) {
      set({ hydrated: true });
      return;
    }
    try {
      const user = await AuthModel.getMe();
      set({ user, isAuthenticated: true, hydrated: true });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        // Session is gone (refresh already failed) — revoke + drop the tokens so
        // the guard routes to /login.
        await AuthModel.logout().catch(() => {});
        set({ user: null, isAuthenticated: false, hydrated: true });
        return;
      }
      // Network error / 5xx: the session may still be valid — keep the tokens.
      set({ isAuthenticated: hasStoredSession(), hydrated: true });
    }
  },

  // AuthModel.logout ends the session → the listener below clears state + cache.
  logout: async () => {
    await AuthModel.logout().catch(() => {});
  },
}));

/** A session exists while either token is stored (the access token may have
 * expired and been cleared while the refresh token can still renew it). */
function hasStoredSession(): boolean {
  return Boolean(getAccessToken() || getRefreshToken());
}

// Logout or a failed refresh: drop the user and reset every cached query in
// place (pinning `auth.me` to null) so no signed-in data outlives the session.
// Routing to /login happens in the root layout.
resetQueriesOnSessionEnd(queryClient, queryKeys.auth.me);
onSessionEnded(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

/**
 * Follow logins/logouts made in other tabs (they write/remove the shared token
 * slots). A remote logout ends the session here (the listener above clears
 * state + cache); a remote login marks the session, drops the cached signed-out
 * profile, marks every query stale so it refetches, and loads the user. Either
 * way `onChange` runs so the caller can re-run the route guards. Returns the
 * unsubscribe.
 */
export function syncAuthWithOtherTabs(onChange: () => void): () => void {
  return syncAuthAcrossTabs({
    keys: [STORAGE_KEYS.ACCESS_TOKEN, STORAGE_KEYS.REFRESH_TOKEN],
    isSignedIn: () => useAuthStore.getState().isAuthenticated,
    hasStoredSession,
    onLogin: () => {
      useAuthStore.setState({ user: null, isAuthenticated: true });
      resyncQueriesAfterLogin(queryClient, queryKeys.auth.me);
      void useAuthStore.getState().hydrate();
      onChange();
    },
    onLogout: onChange,
  });
}
