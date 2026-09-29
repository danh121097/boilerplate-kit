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

/** The revoke in flight, shared by concurrent callers. */
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

  /** The user signs out from this tab. Revokes the refresh token server-side
   * and always drops local tokens and ends the session ("logout", so the
   * login page gets no return path); rejects when the request fails. */
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

  /** The server rejected the session outside a refused refresh (a 401 on the
   * session read). Revokes it like logout (best effort, never rejects) but ends
   * it as "expired", so the expiry redirect carries the current path. Resolves
   * `true` when this call — or the in-flight one it joined — ended the session;
   * `false` when there was nothing to end (see `endServerSession`): nothing is
   * posted and the caller only resets local state. */
  static revokeSession(sinceEpoch?: number): Promise<boolean> {
    if (sinceEpoch !== undefined && getSessionEpoch(this.service) !== sinceEpoch) {
      return Promise.resolve(false);
    }
    revoking ??= this.endServerSession("expired", sinceEpoch).finally(() => {
      revoking = null;
    });
    return revoking;
  }

  /** End the session server-side, then locally with `reason`. POST
   * /auth/logout with the latest token pair (refresh token in the body, access
   * token as Bearer), then clear local tokens and end the session, even when
   * the request fails (a logout then rejects; a revoke does not).
   *
   * An "expired" end backs out — resolves `false`, posts nothing, ends nothing —
   * when the session already ended: the epoch moved since `sinceEpoch` (else
   * since the call started), no tokens are stored, or a logout is running. It
   * checks at the start and again once it holds the lock, since a refused
   * refresh it waited for may have ended the session meanwhile. A logout never
   * backs out.
   *
   * Ordering, so the token revoked is the latest one: from the first tick no
   * refresh may start (a 401 meanwhile rejects with `session_ended` without
   * calling /auth/refresh). `withSessionLock` then waits for a refresh already
   * running — in this tab or, through the Web Lock, in another — to store its
   * rotated pair (capped at 15s, after which it proceeds anyway). Inside it,
   * in one tick, the pair to revoke is read and the epoch bumped, so anything
   * still in flight stores nothing. The pair held at the start is the
   * fallback, in case another tab cleared storage while this one waited. */
  private static async endServerSession(
    reason: SessionEndReason,
    sinceEpoch?: number,
  ): Promise<boolean> {
    const service = this.service;
    const since = sinceEpoch ?? getSessionEpoch(service);
    const ended = () => getSessionEpoch(service) !== since || !hasStoredSession(service);
    if (reason === "expired" && (ended() || isLogoutPending(service))) return false;
    const held = { access: getAccessToken(service), refresh: getRefreshToken(service) };
    const done = beginLogout(service);
    try {
      return await withSessionLock(service, async () => {
        if (reason === "expired" && ended()) return false;
        const access = getAccessToken(service) ?? held.access;
        const refreshToken = getRefreshToken(service) ?? held.refresh;
        bumpSessionEpoch(service);
        try {
          await this.api.post({
            url: authContract.paths.logout,
            data: { refreshToken: refreshToken ?? undefined },
            customHeaders: access ? { authorization: `Bearer ${access}` } : undefined,
          });
        } catch (error) {
          // A revoke is best effort: the session ends below either way.
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

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** The signed-in user, or `null` when the session is gone (401 — a session
   * the server rejected without a refused refresh is revoked first). Any other
   * failure (network, 5xx, refresh unavailable) rejects — the session may
   * still be valid. */
  static async getSession(): Promise<AuthUser | null> {
    const epoch = getSessionEpoch(this.service);
    try {
      return await this.getMe();
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      await this.revokeSession(epoch);
      return null;
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
