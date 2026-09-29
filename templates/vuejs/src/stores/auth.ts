import { queryClient } from "@/plugins/vue-query";
import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import {
  getAccessToken,
  getSessionEpoch,
  hasStoredSession,
  isUnauthorizedError,
  onSessionEnded,
  onTokensChanged,
  resetQueriesToSignedOut,
  resyncQueriesAfterLogin,
  syncAuthAcrossTabs,
  toApiError,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "@/services/auth/types/auth";
import type { ApiResponseError } from "@/services/core";

/**
 * Session state for the SPA.
 *
 * The persisted access token (localStorage) is the synchronous source of truth
 * the router guard relies on, so navigation can be decided before the async
 * profile fetch resolves. localStorage is not reactive, so token presence is
 * mirrored into `hasToken`, kept in sync by the token-storage change hook (login,
 * refresh, logout and interceptor-driven clears all go through it). `user` is
 * the decoded profile — loaded lazily by `hydrate()` on boot and set directly on
 * a successful login. When the main session ends (logout, a refused refresh, or
 * another tab's logout) the profile and every cached query are dropped.
 */
/** Interceptor rejections already are `ApiResponseError`s; normalize the rest. */
function asApiError(error: unknown): ApiResponseError {
  const e = error as Partial<ApiResponseError> | null;
  return typeof e?.error_code === "number" ? (e as ApiResponseError) : toApiError(error);
}

export const useAuthStore = defineStore("auth", () => {
  let retryInFlight: Promise<void> | null = null;

  const user = ref<AuthUser | null>(null);
  const hydrated = ref(false);
  const hasToken = ref(Boolean(getAccessToken(authContract.service)));
  /** Set when boot hydration failed transiently (offline, timeout, 5xx): the
   * session is kept and `retryHydrate()` can try again. */
  const hydrateError = ref<ApiResponseError | null>(null);
  /** True while a `retryHydrate()` is in flight (the banner's Retry disables). */
  const retrying = ref(false);

  const isAuthenticated = computed(() => Boolean(user.value) || hasToken.value);

  function setUser(next: AuthUser | null) {
    user.value = next;
  }

  /** Drop the profile and cached data only — the stored tokens are not touched. */
  function resetSignedOut() {
    user.value = null;
    hydrateError.value = null;
    resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
  }

  /**
   * Read the persisted session once at boot; if present, resolve the profile.
   * A rejected session (401 after the refresh attempt) is revoked through
   * `AuthModel.revokeSession()`, which ends it as "expired" (the expiry redirect
   * keeps a return path) — or posts nothing when it already ended while the
   * request ran. Either way local state is reset. A network error, timeout or
   * 5xx keeps the tokens so the session survives an outage.
   */
  async function hydrate() {
    if (hydrated.value) return;
    // hydrateError is cleared on completion, not here, so the banner (and its
    // disabled Retry button) stays up while a retry runs.
    const service = authContract.service;
    if (hasStoredSession(service)) {
      const sinceEpoch = getSessionEpoch(service);
      try {
        const me = await AuthModel.getMe();
        // The session ended while the read was in flight (logout, another tab):
        // the session-end path already reset state, so a late success is dropped.
        if (getSessionEpoch(service) === sinceEpoch && hasStoredSession(service)) {
          user.value = me;
          hydrateError.value = null;
        }
      } catch (error) {
        if (getSessionEpoch(service) !== sinceEpoch) {
          // The session changed while the read ran (logout, or a login elsewhere
          // with its own read): that path owns the state, so the failure is dropped.
        } else if (isUnauthorizedError(error)) {
          await AuthModel.revokeSession(sinceEpoch);
          resetSignedOut();
        } else if (!hasStoredSession(service)) {
          resetSignedOut();
        } else {
          hydrateError.value = { ...asApiError(error), retryable: true };
        }
      }
    } else {
      hydrateError.value = null;
    }
    hydrated.value = true;
  }

  /** Re-run hydration after a transient failure (the banner's Retry). Clicks
   * share one in-flight run; a login elsewhere starts its own read instead. */
  function retryHydrate() {
    if (retryInFlight) return retryInFlight;
    hydrated.value = false;
    retrying.value = true;
    retryInFlight = hydrate().finally(() => {
      retrying.value = false;
      retryInFlight = null;
    });
    return retryInFlight;
  }

  function syncHasToken() {
    hasToken.value = Boolean(getAccessToken(authContract.service));
  }

  onTokensChanged((service) => {
    if (service === authContract.service) syncHasToken();
  });

  // The main session ended here or in another tab: drop the profile and every
  // cached query's data (mounted views stay attached); the guard state follows.
  onSessionEnded((_reason, service) => {
    if (service !== authContract.service) return;
    user.value = null;
    hydrateError.value = null;
    syncHasToken();
    resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
  });

  // Another tab logged in: reset the profile, mark every query stale (mounted
  // ones refetch) and re-read the profile. A logout there reaches the listener
  // above; a plain token rotation (refresh) elsewhere is ignored. Browser-only.
  syncAuthAcrossTabs({
    onLogin: () => {
      syncHasToken();
      user.value = null;
      hydrateError.value = null;
      resyncQueriesAfterLogin(queryClient, queryKeys.auth.me);
      // A fresh read, not retryHydrate(): a Retry still in flight belongs to the
      // ended session and its result is dropped.
      hydrated.value = false;
      void hydrate();
    },
  });

  return {
    user,
    hydrated,
    hydrateError,
    retrying,
    isAuthenticated,
    setUser,
    hydrate,
    retryHydrate,
  };
});
