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

  /** Revoke the refresh token server-side (sent in the body, with the access
   * token as Bearer), then always drop local tokens and end the session so
   * listeners clear cached queries, even when the request fails.
   *
   * Ordering, so the token revoked is the latest one: from the first tick no
   * refresh may start (a 401 meanwhile rejects with `session_ended` without
   * calling /auth/refresh). `withSessionLock` then waits for a refresh already
   * running — in this tab or, through the Web Lock, in another — to store its
   * rotated pair (capped at 15s, after which logout proceeds anyway). Inside it,
   * in one tick, the pair to revoke is read and the epoch bumped, so anything
   * still in flight stores nothing. The pair held when logout started is the
   * fallback, in case another tab cleared storage while this one waited. */
  static async logout(): Promise<void> {
    const service = this.service;
    const held = { access: getAccessToken(service), refresh: getRefreshToken(service) };
    const done = beginLogout(service);
    try {
      await withSessionLock(service, async () => {
        const access = getAccessToken(service) ?? held.access;
        const refreshToken = getRefreshToken(service) ?? held.refresh;
        bumpSessionEpoch(service);
        try {
          await this.api.post({
            url: authContract.paths.logout,
            data: { refreshToken: refreshToken ?? undefined },
            customHeaders: access ? { authorization: `Bearer ${access}` } : undefined,
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

  /** The signed-in user, or `null` when the session is gone (401). Any other
   * failure (network, 5xx, refresh unavailable) rejects — the session may
   * still be valid. */
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
