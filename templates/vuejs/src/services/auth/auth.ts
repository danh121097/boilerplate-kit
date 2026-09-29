import { authContract } from "@/services/auth/contract";
import { mockAuthAdapter } from "@/services/auth/mock-auth";
import {
  beginLogout,
  bumpSessionEpoch,
  clearAuthTokens,
  defineMutation,
  defineQuery,
  endSession,
  getAccessToken,
  getRefreshToken,
  getSessionEpoch,
  hasStoredSession,
  isLogoutPending,
  isUnauthorizedError,
  Model,
  persistAccessToken,
  persistRefreshToken,
  withSessionLock,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type {
  AuthResult,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from "@/services/auth/types/auth";
import type { SessionEndReason } from "@/services/core";

/** The revoke in flight, shared by concurrent `revokeSession` callers. */
let revoking: Promise<boolean> | null = null;

/** Logouts started in this tab and still ending the session. */
let loggingOut = 0;

export class AuthModel extends Model {
  static {
    Model.setup.call(this, {
      path: authContract.base,
      service: authContract.service,
      // Dev-only mock auth answers /auth/* in the browser; undefined otherwise.
      adapter: mockAuthAdapter,
    });
  }

  static async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: authContract.paths.login, data: payload });
    return this.storeSession(res.data);
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.register,
      data: payload,
    });
    return this.storeSession(res.data);
  }

  /** The user signs out in this tab. Revokes the session server-side and ends
   * it as "logout" (the caller navigates; no return path). Rejects when the
   * request fails, but the session is ended locally either way. Called while a
   * revoke is in flight, it waits for that one instead (one request, one end). */
  static async logout(): Promise<void> {
    // A revoke in flight already ends this session: wait for it, post nothing.
    // If that revoke backs out (nothing to end), log out normally.
    if (revoking && (await revoking)) return;
    loggingOut++;
    try {
      await this.endServerSession("logout");
    } finally {
      loggingOut--;
    }
  }

  /** True while this tab's own `logout` is ending the session, including when
   * its "logout" session end is emitted. A revoke or another tab's logout never
   * sets it, so session-end listeners can tell this tab's logout apart. */
  static isLoggingOut(): boolean {
    return loggingOut > 0;
  }

  /**
   * The server rejected the session outside a refused refresh (a 401 on the
   * session read). Revokes it like `logout` but ends it as "expired", so the
   * session-expiry redirect adds a return path. Best effort: a failed request
   * still ends the session locally, and the promise never rejects.
   *
   * Resolves true when this call (or the in-flight one it joined) ended the
   * session, false when it had already ended and nothing was posted: the epoch
   * moved since `sinceEpoch` (captured before the rejected request), a logout is
   * running, or no token is stored — checked on entry, and the epoch and storage
   * again once the refresh lock is held. The caller then only resets local state.
   * Concurrent callers share one in-flight revoke.
   */
  static revokeSession(sinceEpoch?: number): Promise<boolean> {
    if (sinceEpoch !== undefined && getSessionEpoch(this.service) !== sinceEpoch) {
      return Promise.resolve(false);
    }
    revoking ??= this.endServerSession("expired", sinceEpoch).finally(() => {
      revoking = null;
    });
    return revoking;
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** The signed-in user, or null when the session is rejected (401 — after the
   * interceptor's refresh attempt; the session is then revoked through
   * `revokeSession`). Other failures (offline, 5xx) reject. */
  static async getSession(): Promise<AuthUser | null> {
    const sinceEpoch = getSessionEpoch(this.service);
    try {
      return await this.getMe();
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      await this.revokeSession(sinceEpoch);
      return null;
    }
  }

  /** Revoke the refresh token server-side (sent in the body — this client keeps
   * it in localStorage, not the cookie), drop every stored token and end the
   * session with `reason`. Shared by `logout` and `revokeSession`. Resolves
   * true once the session is ended.
   *
   * A revoke ("expired") backs out — resolves false, posts nothing, ends
   * nothing — when a logout is already running, or when the session already
   * ended (checked on entry and again once the lock is held): the epoch
   * moved since `sinceEpoch` (else since this call started — e.g. a refused
   * refresh that held the lock), or no token is stored. A logout never takes
   * that exit.
   *
   * Never overlaps a token refresh: an in-flight refresh finishes first (so the
   * token revoked is the latest rotated one; the wait is capped at 15s). Both
   * tokens are captured when it starts; the ones stored when the lock is taken
   * win, the captured copy is the fallback if storage was emptied meanwhile.
   * Then — synchronously, before the request — the session is marked as ending,
   * so a 401 arriving while the request is in flight rejects with
   * `session_ended` instead of rotating the token being revoked; a refresh
   * landing afterwards writes nothing back. The tokens are cleared and the
   * session ended even when the request fails (a logout then rejects; a revoke
   * is best effort and resolves true). */
  private static async endServerSession(
    reason: SessionEndReason,
    sinceEpoch?: number,
  ): Promise<boolean> {
    const service = this.service;
    const startEpoch = sinceEpoch ?? getSessionEpoch(service);

    const ended = () => getSessionEpoch(service) !== startEpoch || !hasStoredSession(service);
    // Nothing left to revoke, or a running logout ends this session itself.
    if (reason === "expired" && (ended() || isLogoutPending(service))) return false;
    // Captured before any await: if storage is emptied while this waits
    // (another tab, a refused refresh), these are still revoked.
    const held = { access: getAccessToken(service), refresh: getRefreshToken(service) };
    // Logout-pending from the first tick: no refresh starts while this waits
    // for an in-flight one or while its request is in flight.
    const done = beginLogout(service);
    try {
      return await withSessionLock(service, async () => {
        // Re-checked under the lock: the session may have ended while this waited.
        if (reason === "expired" && ended()) return false;
        // One synchronous tick: pick what to revoke (the latest stored tokens,
        // else the copy captured at the start), then end the epoch.
        const refreshToken = getRefreshToken(service) ?? held.refresh ?? undefined;
        const accessToken = getAccessToken(service) ?? held.access;
        bumpSessionEpoch(service);
        try {
          await this.api.post({
            url: authContract.paths.logout,
            data: { refreshToken },
            ...(accessToken ? { customHeaders: { authorization: `Bearer ${accessToken}` } } : {}),
          });
        } catch (error) {
          // Best effort for a revoke; a logout reports the failure.
          if (reason === "logout") throw error;
        } finally {
          clearAuthTokens();
          endSession(reason, service);
        }
        return true;
      });
    } finally {
      done();
    }
  }

  /** Persist both tokens: access for the Bearer header, refresh for the refresh call. */
  private static storeSession(result: AuthResult): AuthResult {
    persistAccessToken(result.tokens.accessToken, this.service);
    if (result.tokens.refreshToken) persistRefreshToken(result.tokens.refreshToken, this.service);
    return result;
  }
}

// Queries
export const useMeQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: () => AuthModel.getSession(),
});

// Mutations

export const useLoginMutation = defineMutation<AuthResult, LoginPayload>({
  key: queryKeys.auth.login,
  mutator: (payload) => AuthModel.login(payload),
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: queryKeys.auth.register,
  mutator: (payload) => AuthModel.register(payload),
});

export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
  // Run even offline: a paused logout would never settle, leaving the user
  // signed in with a spinning button. The client signs out on settle anyway.
  options: { networkMode: "always" },
});
