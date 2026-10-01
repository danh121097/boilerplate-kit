import { queryClient } from "@/providers/query-client-provider";
import { AuthModel, authContract } from "@/services/auth";
import {
  getSessionEpoch,
  hasStoredSession,
  isSessionGoneError,
  onSessionEnded,
  resetQueriesOnSessionEnd,
  resetQueriesToSignedOut,
  SessionEndedError,
  toApiError,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { create } from "zustand";
import type { AuthUser } from "@/services/auth/types/auth";
import type { ApiResponseError } from "@/services/core";

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
  /** Set when restoring the session failed transiently (offline, timeout, 5xx):
   * the session is kept and `retryHydrate()` can try again. Null otherwise. */
  hydrateError: ApiResponseError | null;
  /** Reset auth state after the refresh endpoint refused the session. */
  expireSession: () => void;
  setUser: (user: AuthUser | null) => void;
  /** Boot-time restore: read the persisted token, resolve the user, mark hydrated. */
  hydrate: () => Promise<void>;
  /** Re-run the restore after a transient failure (does not show the boot splash again). */
  retryHydrate: () => Promise<void>;
  /** (Re)fetch the signed-in user. Safe to call again after a transient failure. */
  loadUser: () => Promise<void>;
  /** Local sign-out after the logout request settled (`useLogoutMutation`'s
   * `onSettled`): reset state and the query cache, and mark an explicit logout so
   * the gate goes to a plain /login. Does not call the API. */
  clearSession: () => void;
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
  hydrateError: null,

  expireSession: () => set({ user: null, isAuthenticated: false, hydrateError: null }),

  setUser: (user) =>
    set({ user, isAuthenticated: Boolean(user), loggedOut: false, hydrateError: null }),

  hydrate: async () => {
    await restoreSession(get);
    set({ hydrated: true });
  },

  retryHydrate: () => restoreSession(get),

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

  clearSession: () => {
    resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
    set({ user: null, isAuthenticated: false, loggedOut: true, hydrateError: null });
  },
}));

/** Read the persisted session and, if present, resolve the user. A stale token
 * 401s in `loadUser`; the interceptor refreshes if it can. Only a 401 ends the
 * session. */
async function restoreSession(get: () => AuthState): Promise<void> {
  const signedIn = await readStoredSession();
  if (signedIn === null) return keepStateOnReadError();
  if (!signedIn) {
    useAuthStore.setState({ user: null, isAuthenticated: false, hydrateError: null });
    return;
  }
  await get().loadUser();
}

/** Whether tokens are stored, or null when SecureStore could not be read (says
 * nothing about the session: never treat it as signed out). */
async function readStoredSession(): Promise<boolean | null> {
  try {
    return await hasStoredSession(authContract.service);
  } catch {
    return null;
  }
}

/** A SecureStore read failed: keep the current state and flag it so the UI can retry. */
function keepStateOnReadError(): void {
  useAuthStore.setState({
    hydrateError: { ...toApiError(new Error("storage_unavailable")), retryable: true },
  });
}

/** Interceptor rejections already are `ApiResponseError`s; normalize the rest. */
function asApiError(error: unknown): ApiResponseError {
  const e = error as Partial<ApiResponseError> | null;
  return typeof e?.error_code === "number" ? (e as ApiResponseError) : toApiError(error);
}

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
    useAuthStore.setState({ user, isAuthenticated: true, hydrateError: null });
  } catch (error) {
    if (isStale()) return;
    if (isSessionGoneError(error)) {
      // The session query itself was refused (401), or the backend no longer
      // knows the user (404, e.g. the account was deleted): the session is over.
      // Revoke it as expired — unless it already ended (logout in progress,
      // refused refresh): then only reset local state.
      if (!(error instanceof SessionEndedError)) await AuthModel.revokeSession(epoch);
      useAuthStore.setState({ user: null, isAuthenticated: false, hydrateError: null });
      return;
    }
    // Offline / 5xx / 429 / timeout / an unavailable refresh keep the tokens:
    // stay signed in with an unknown user and let the UI retry.
    const stillSignedIn = await readStoredSession();
    if (isStale()) return;
    if (stillSignedIn === null) return keepStateOnReadError();
    useAuthStore.setState(
      stillSignedIn
        ? { isAuthenticated: true, hydrateError: { ...asApiError(error), retryable: true } }
        : { user: null, isAuthenticated: false, hydrateError: null },
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
