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
  Model,
  persistAccessToken,
  persistRefreshToken,
  SESSION_WAIT_TIMEOUT_MS,
  settleInFlightRefreshes,
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
   * Ordering, so the token revoked is the latest one: in the first tick no
   * refresh may start (a 401 meanwhile rejects with `session_ended` without
   * calling /auth/refresh) and both tokens are captured; a refresh already
   * running in this tab settles and stores its rotated pair first, and the
   * refresh lock waits out one running in another tab. Both waits share a 15s
   * cap, after which logout proceeds anyway. The epoch bump then makes anything
   * still in flight store nothing. */
  static async logout(): Promise<void> {
    const deadline = Date.now() + SESSION_WAIT_TIMEOUT_MS;
    const captured = {
      access: getAccessToken(this.service),
      refresh: getRefreshToken(this.service),
    };
    const done = beginLogout();
    try {
      await settleInFlightRefreshes(SESSION_WAIT_TIMEOUT_MS);
      const maxWaitMs = Math.max(0, deadline - Date.now());
      await withSessionLock(
        this.service,
        async () => {
          bumpSessionEpoch();
          // Prefer a pair a settled refresh just rotated in; else what was captured.
          const access = getAccessToken(this.service) ?? captured.access;
          const refreshToken = getRefreshToken(this.service) ?? captured.refresh;
          try {
            await this.api.post({
              url: authContract.paths.logout,
              data: { refreshToken: refreshToken ?? undefined },
              customHeaders: access ? { authorization: `Bearer ${access}` } : undefined,
            });
          } finally {
            clearAuthTokens();
            endSession("logout", this.service);
          }
        },
        { maxWaitMs },
      );
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
