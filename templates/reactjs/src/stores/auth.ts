import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import {
  getSessionEpoch,
  hasStoredSession,
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
  isAuthenticated: hasStoredSession(authContract.service),
  hydrated: false,

  setUser: (user) =>
    set({ user, isAuthenticated: Boolean(user) || hasStoredSession(authContract.service) }),

  hydrate: async () => {
    if (!hasStoredSession(authContract.service)) {
      set({ hydrated: true });
      return;
    }
    const epoch = getSessionEpoch(authContract.service);
    try {
      const user = await AuthModel.getMe();
      set({ user, isAuthenticated: true, hydrated: true });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        // The server rejected the session: revoke it (ends as "expired", so the
        // login page returns here). A refused refresh or a running logout
        // already ended it — then this only resets local state.
        await AuthModel.revokeSession(epoch);
        set({ user: null, isAuthenticated: false, hydrated: true });
        return;
      }
      // Network error / 5xx: the session may still be valid — keep the tokens.
      set({ isAuthenticated: hasStoredSession(authContract.service), hydrated: true });
    }
  },

  // AuthModel.logout ends the session → the listener below clears state + cache.
  logout: async () => {
    await AuthModel.logout().catch(() => {});
  },
}));

// Logout or a refused refresh of the auth service: drop the user and reset
// every cached query in place (pinning `auth.me` to null) so no signed-in data
// outlives the session. Another service's session end keeps the user signed in.
// Routing to /login happens in the root layout.
resetQueriesOnSessionEnd(queryClient, queryKeys.auth.me, authContract.service);
onSessionEnded((_reason, service) => {
  if (service !== authContract.service) return;
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
    onLogin: () => {
      useAuthStore.setState({ user: null, isAuthenticated: true });
      resyncQueriesAfterLogin(queryClient, queryKeys.auth.me);
      void useAuthStore.getState().hydrate();
      onChange();
    },
    onLogout: onChange,
  });
}
