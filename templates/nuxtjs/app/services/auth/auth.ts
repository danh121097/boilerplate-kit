import { authContract } from "@/services/auth/contract";
import { mockAuthAdapter } from "@/services/auth/data/mock-auth";
import {
  beginLogout,
  bumpSessionEpoch,
  defineMutation,
  endSession,
  getSessionEpoch,
  hasSessionHint,
  isLogoutPending,
  isUnauthorizedError,
  Model,
  startSession,
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
    startSession();
    return res.data;
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.register,
      data: payload,
    });
    startSession();
    return res.data;
  }

  /** The user signs out in this tab. Revokes the session server-side and ends
   * it as "logout" (the caller navigates; no return path). Rejects when the
   * request fails, but the session is ended locally either way. Called while a
   * revoke is in flight, it waits for that one instead (one request, one end). */
  static async logout(): Promise<void> {
    // A revoke in flight already ends this session: wait for it, post nothing.
    // If that revoke backs out (nothing to end), log out normally.
    if (revoking && (await revoking)) return;
    await this.endServerSession("logout");
  }

  /**
   * The server rejected the session outside a refused refresh (a browser-side
   * 401 on the session read while the hint is set). Revokes it like `logout`
   * but ends it as "expired", so the session-expiry redirect adds a return
   * path. Best effort: a failed request still ends the session locally, and the
   * promise never rejects. Browser-only — SSR never revokes.
   *
   * Resolves true when this call (or the in-flight one it joined) ended the
   * session, false when it had already ended and nothing was posted: the epoch
   * moved since `sinceEpoch` (captured before the rejected request), a logout is
   * running, or no hint is set — checked on entry, and the epoch and hint again
   * once the refresh lock is held. Concurrent callers share one in-flight revoke.
   */
  static revokeSession(sinceEpoch?: number): Promise<boolean> {
    if (typeof document === "undefined") return Promise.resolve(false);
    if (sinceEpoch !== undefined && getSessionEpoch(this.service) !== sinceEpoch) {
      return Promise.resolve(false);
    }
    revoking ??= this.endServerSession("expired", sinceEpoch).finally(() => {
      revoking = null;
    });
    return revoking;
  }

  /** Browser-side profile read — goes through the interceptors, so an expired
   * access cookie is refreshed and the request replayed. */
  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** The signed-in user, or null when the session is rejected (401 — after the
   * interceptor's refresh attempt; a live session is then revoked through
   * `revokeSession`). Other failures (offline, 5xx) reject. */
  static async getSession(): Promise<AuthUser | null> {
    const sinceEpoch = getSessionEpoch(this.service);
    try {
      return await this.getMe();
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      // Rejected despite the refresh: revoke it unless it already ended (no
      // hint → an anonymous visitor; nothing to revoke).
      await this.revokeSession(sinceEpoch);
      return null;
    }
  }

  /** The httpOnly refresh cookie (scoped to the auth routes) identifies the
   * session to revoke — there is no token to send from JS. Ends the session
   * with `reason`; shared by `logout` and `revokeSession`. Resolves true once
   * the session is ended.
   *
   * A revoke ("expired") backs out — resolves false, posts nothing, ends
   * nothing — when a logout is already running, or when the session already
   * ended (checked on entry and again once the lock is held): the epoch
   * moved since `sinceEpoch` (else since this call started — e.g. a refused
   * refresh that held the lock), or the hint is gone. A logout never takes
   * that exit.
   *
   * Never overlaps a token refresh: an in-flight refresh finishes first (so the
   * cookie revoked is the latest rotated one; the wait is capped at 15s). The
   * session is marked as ending from the first tick and its epoch ends right
   * before the request, so a 401 arriving meanwhile rejects with
   * `session_ended` instead of rotating the cookie being revoked, and a refresh
   * landing afterwards does not re-mark the session. The session ends (hint
   * dropped, other tabs told, query cache reset) even when the call fails (a
   * logout then rejects; a revoke is best effort and resolves true): this
   * browser's session is over either way. */
  private static async endServerSession(
    reason: SessionEndReason,
    sinceEpoch?: number,
  ): Promise<boolean> {
    const service = this.service;
    const startEpoch = sinceEpoch ?? getSessionEpoch(service);

    const ended = () => getSessionEpoch(service) !== startEpoch || !hasSessionHint();
    // Nothing left to revoke, or a running logout ends this session itself.
    if (reason === "expired" && (ended() || isLogoutPending(service))) return false;
    const done = beginLogout(service);
    try {
      return await withSessionLock(service, async () => {
        // Re-checked under the lock: the session may have ended while this waited.
        if (reason === "expired" && ended()) return false;
        bumpSessionEpoch(service);
        try {
          await this.api.post({ url: authContract.paths.logout });
        } catch (error) {
          // Best effort for a revoke; a logout reports the failure.
          if (reason === "logout") throw error;
        } finally {
          endSession(reason, service);
        }
        return true;
      });
    } finally {
      done();
    }
  }
}

// Mutations

export const useLoginMutation = defineMutation<AuthResult, LoginPayload>({
  key: queryKeys.auth.login,
  mutator: (payload) => AuthModel.login(payload),
  invalidates: [queryKeys.auth.me, queryKeys.users.list],
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: queryKeys.auth.register,
  mutator: (payload) => AuthModel.register(payload),
  invalidates: [queryKeys.auth.me, queryKeys.users.list],
});

/** Logout ends the session, which resets every query to signed-out
 * (`04.session-expiry.client.ts`) — nothing to invalidate. */
export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
  // Run even offline: a paused logout would never settle, leaving the user
  // signed in with a spinning button. The client signs out on settle anyway.
  options: { networkMode: "always" },
});
