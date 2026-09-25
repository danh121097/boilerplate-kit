import { queryClient } from "@/plugins/vue-query";
import { AuthModel } from "@/services/auth/auth";
import { authContract } from "@/services/auth/contract";
import {
  clearAuthTokens,
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
  const user = ref<AuthUser | null>(null);
  const hydrated = ref(false);
  const hasToken = ref(Boolean(getAccessToken(authContract.service)));
  /** Set when boot hydration failed transiently (offline, timeout, 5xx): the
   * session is kept and `retryHydrate()` can try again. */
  const hydrateError = ref<ApiResponseError | null>(null);

  const isAuthenticated = computed(() => Boolean(user.value) || hasToken.value);

  function setUser(next: AuthUser | null) {
    user.value = next;
  }

  /** Drop the session client-side: profile, tokens and every cached query's
   * data (so the next user never sees the previous user's data). Mounted views
   * keep their observers, so the next login's refetch reaches them. */
  function clearSession() {
    user.value = null;
    clearAuthTokens();
    resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
  }

  /** Drop the profile and cached data only — the stored tokens are not touched. */
  function resetSignedOut() {
    user.value = null;
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
    hydrateError.value = null;
    const service = authContract.service;
    if (hasStoredSession(service)) {
      const sinceEpoch = getSessionEpoch(service);
      try {
        user.value = await AuthModel.getMe();
      } catch (error) {
        if (isUnauthorizedError(error)) {
          await AuthModel.revokeSession(sinceEpoch);
          resetSignedOut();
        } else if (getSessionEpoch(service) !== sinceEpoch || !hasStoredSession(service)) {
          resetSignedOut();
        } else {
          hydrateError.value = { ...asApiError(error), retryable: true };
        }
      }
    }
    hydrated.value = true;
  }

  /** Re-run hydration after a transient failure. */
  function retryHydrate() {
    hydrated.value = false;
    return hydrate();
  }

  /** Revoke the session server-side (best effort) and clear it client-side. */
  async function logout() {
    await AuthModel.logout().catch(() => {});
    clearSession();
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
      void retryHydrate();
    },
  });

  return {
    user,
    hydrated,
    hydrateError,
    isAuthenticated,
    setUser,
    clearSession,
    hydrate,
    retryHydrate,
    logout,
  };
});
