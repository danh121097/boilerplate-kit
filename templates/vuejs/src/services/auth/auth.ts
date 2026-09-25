import { authContract } from "@/services/auth/contract";
import {
  beginLogout,
  bumpSessionEpoch,
  clearAuthTokens,
  defineMutation,
  defineQuery,
  endSession,
  getAccessToken,
  getRefreshToken,
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

export class AuthModel extends Model {
  static {
    Model.setup.call(this, { path: authContract.base, service: authContract.service });
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

  /** Revoke the refresh token server-side (sent in the body — this client keeps
   * it in localStorage, not the cookie), then drop every stored token.
   *
   * Never overlaps a token refresh: an in-flight refresh finishes first (so the
   * token revoked is the latest rotated one; the wait is capped at 15s). Both
   * tokens are captured when logout starts; the ones stored when the lock is
   * taken win, the captured copy is the fallback if storage was emptied
   * meanwhile. Then — synchronously, before the request — the session is
   * marked as ending, so a 401 arriving while the logout request is in flight
   * rejects with `session_ended` instead of rotating the token being revoked; a
   * refresh landing afterwards writes nothing back. The tokens are cleared and
   * the session ended ("logout" — no session-expired redirect) even when the
   * request fails. */
  static async logout(): Promise<void> {
    const service = this.service;
    // Captured before any await: if storage is emptied while logout waits
    // (another tab, a refused refresh), these are still revoked.
    const held = { access: getAccessToken(service), refresh: getRefreshToken(service) };
    // Logout-pending from the first tick: no refresh starts while logout waits
    // for an in-flight one or while its request is in flight.
    const done = beginLogout(service);
    try {
      await withSessionLock(service, async () => {
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
        } finally {
          clearAuthTokens();
          endSession("logout", service);
        }
      });
    } finally {
      done();
    }
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** The signed-in user, or null when the session is rejected (401 — after the
   * interceptor's refresh attempt). Other failures (offline, 5xx) reject. */
  static async getSession(): Promise<AuthUser | null> {
    try {
      return await this.getMe();
    } catch (error) {
      if (isUnauthorizedError(error)) return null;
      throw error;
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
});
