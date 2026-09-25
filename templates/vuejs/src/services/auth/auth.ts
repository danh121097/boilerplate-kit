import { authContract } from "@/services/auth/contract";
import {
  beginLogout,
  bumpSessionEpoch,
  clearAuthTokens,
  defineMutation,
  defineQuery,
  getAccessToken,
  getRefreshToken,
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
   * token revoked is the latest rotated one; the wait is capped at 15s). Then —
   * synchronously, before the request — both tokens are captured and the session
   * marked as ending, so a 401 arriving while the logout request is in flight
   * rejects with `session_ended` instead of rotating the token being revoked; a
   * refresh landing afterwards writes nothing back. The tokens are cleared even
   * when the request fails. */
  static async logout(): Promise<void> {
    const service = this.service;
    // Logout-pending from the first tick: no refresh starts while logout waits
    // for an in-flight one or while its request is in flight.
    const done = beginLogout(service);
    try {
      await withSessionLock(service, async () => {
        // One synchronous tick: capture what to revoke, then end the epoch.
        const refreshToken = getRefreshToken(service) ?? undefined;
        const accessToken = getAccessToken(service);
        bumpSessionEpoch(service);
        try {
          await this.api.post({
            url: authContract.paths.logout,
            data: { refreshToken },
            ...(accessToken ? { customHeaders: { authorization: `Bearer ${accessToken}` } } : {}),
          });
        } finally {
          clearAuthTokens();
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

  /** Persist both tokens: access for the Bearer header, refresh for the refresh call. */
  private static storeSession(result: AuthResult): AuthResult {
    persistAccessToken(result.tokens.accessToken, this.service);
    if (result.tokens.refreshToken) persistRefreshToken(result.tokens.refreshToken, this.service);
    return result;
  }
}

// Queries
export const useMeQuery = defineQuery<AuthUser>({
  key: queryKeys.auth.me,
  fetcher: () => AuthModel.getMe(),
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
