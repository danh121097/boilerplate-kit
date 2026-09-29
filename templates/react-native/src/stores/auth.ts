import { queryClient } from "@/providers/query-client-provider";
import { AuthModel, authContract } from "@/services/auth";
import {
  getSessionEpoch,
  hasStoredSession,
  isUnauthorizedError,
  onSessionEnded,
  resetQueriesOnSessionEnd,
  resetQueriesToSignedOut,
  SessionEndedError,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
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
  /** True after an explicit logout, until the login screen shows: the auth gate
   * then sends the user to a plain /login (any other guest gets `?redirect=`). */
  loggedOut: boolean;
  /** Reset auth state after the refresh endpoint refused the session. */
  expireSession: () => void;
  setUser: (user: AuthUser | null) => void;
  /** Boot-time restore: read the persisted token, resolve the user, mark hydrated. */
  hydrate: () => Promise<void>;
  /** (Re)fetch the signed-in user. Safe to call again after a transient failure. */
  loadUser: () => Promise<void>;
  /** Sign out: revoke server-side, clear SecureStore + query cache, reset state. */
  logout: () => Promise<void>;
}

/**
 * Zustand auth store — the app's session source of truth. The auth-gated route
 * group reads `isAuthenticated`/`hydrated`; `watchSessionEnd` (subscribed by the
 * root layout) resets it when the refresh endpoint refuses the session.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  hydrated: false,
  loggedOut: false,

  expireSession: () => set({ user: null, isAuthenticated: false }),

  setUser: (user) => set({ user, isAuthenticated: Boolean(user), loggedOut: false }),

  hydrate: async () => {
    const signedIn = await hasStoredSession(authContract.service).catch(() => false);
    if (!signedIn) {
      set({ user: null, isAuthenticated: false, hydrated: true });
      return;
    }
    // A session is stored — resolve the user. A stale token 401s here; the
    // interceptor refreshes if it can. Only a 401 ends the session.
    await get().loadUser();
    set({ hydrated: true });
  },

  loadUser: () => {
    // Overlapping calls in the same session share one getMe, so two callers
    // hitting the same 401 run a single logout.
    const epoch = getSessionEpoch(authContract.service);
    if (inFlightLoad?.epoch === epoch) return inFlightLoad.promise;
    const promise = loadUserOnce(epoch).finally(() => {
      if (inFlightLoad?.promise === promise) inFlightLoad = null;
    });
    inFlightLoad = { epoch, promise };
    return promise;
  },

  logout: async () => {
    try {
      await AuthModel.logout();
    } catch {
      // Ignore network errors — tokens are cleared by the model regardless.
    } finally {
      resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
      set({ user: null, isAuthenticated: false, loggedOut: true });
    }
  },
}));

/** The getMe that `loadUser` shares with overlapping calls of the same session. */
let inFlightLoad: { epoch: number; promise: Promise<void> } | null = null;

/** Resolve the signed-in user for the session of `epoch`. A logout / expiry
 * while getMe is in flight bumps the epoch; a late result (success or failure)
 * must not resurrect or rewrite that ended session. */
async function loadUserOnce(epoch: number): Promise<void> {
  const isStale = () => getSessionEpoch(authContract.service) !== epoch;
  try {
    const user = await AuthModel.getMe();
    if (isStale()) return;
    useAuthStore.setState({ user, isAuthenticated: true });
  } catch (error) {
    if (isStale()) return;
    if (isUnauthorizedError(error)) {
      // The session query itself was refused: the session is over. Revoke it as
      // expired — unless it already ended (logout in progress, refused refresh):
      // then only reset local state.
      if (!(error instanceof SessionEndedError)) await AuthModel.revokeSession(epoch);
      useAuthStore.setState({ user: null, isAuthenticated: false });
      return;
    }
    // Offline / 5xx / 429 / timeout / an unavailable refresh keep the tokens:
    // stay signed in with an unknown user and let the UI retry.
    const stillSignedIn = await hasStoredSession(authContract.service).catch(() => false);
    if (isStale()) return;
    useAuthStore.setState(
      stillSignedIn ? { isAuthenticated: true } : { user: null, isAuthenticated: false },
    );
  }
}

/**
 * React to the end of the app's session (auth service only — a secondary
 * backend's refused refresh ends just that backend's session): reset every
 * cached query to signed-out, and after an expiry mark the involuntary sign-out
 * so the `(app)` gate redirects to /login with a `redirect`. Idempotent: a burst
 * of expiries resets state once. Subscribed by the root layout; returns the
 * unsubscribe.
 */
export function watchSessionEnd(): () => void {
  const stopReset = resetQueriesOnSessionEnd(queryClient, queryKeys.auth.me, authContract.service);
  const stopExpire = onSessionEnded((reason, service) => {
    if (reason !== "expired" || service !== authContract.service) return;
    if (!useAuthStore.getState().isAuthenticated) return;
    useAuthStore.getState().expireSession();
  });
  return () => {
    stopReset();
    stopExpire();
  };
}
