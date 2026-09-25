import { authContract } from "@/services/auth/contract";
import {
  clearAuthTokens,
  defineMutation,
  defineQuery,
  getAccessToken,
  getRefreshToken,
  Model,
  persistAccessToken,
  persistRefreshToken,
  RefreshTokenManager,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type {
  AuthResult,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from "@/services/auth/types/auth";

/** Longest sign-out waits for an in-flight token refresh before revoking anyway. */
export const LOGOUT_REFRESH_WAIT_MS = 15_000;

export class AuthModel extends Model {
  static {
    Model.setup.call(this, { path: authContract.base, service: authContract.service });
  }

  static async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.login,
      data: payload,
      skipAuthRefresh: true,
    });
    return this.storeSession(res.data);
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.register,
      data: payload,
      skipAuthRefresh: true,
    });
    return this.storeSession(res.data);
  }

  /**
   * Sign out: revoke the LATEST refresh token server-side, having already cleared
   * every stored token locally.
   *
   * 1. Wait out any in-flight refresh (looping in case another starts meanwhile)
   *    so the token we revoke is the rotated one, not the one it replaced — a
   *    rotated-but-unrevoked token would stay valid on the server. The total wait
   *    is capped (`LOGOUT_REFRESH_WAIT_MS`): after that, sign-out proceeds with
   *    whatever token is stored, so a hung refresh cannot block it.
   * 2. Read both tokens together, then clear local tokens synchronously after the
   *    last check: this bumps the session epoch (a later refresh cannot re-save
   *    anything) and, with no access token left, no new refresh can start.
   * 3. POST `{ refreshToken }` — in the body, the app has no cookie jar — with the
   *    access token read in step 2 as an explicit Bearer header (the interceptor
   *    finds nothing to attach after the clear). `skipAuthRefresh` keeps a 401
   *    here from refreshing or firing session-expired.
   */
  static async logout(): Promise<void> {
    let refreshToken: string | undefined;
    let accessToken: string | undefined;

    const deadline = Date.now() + LOGOUT_REFRESH_WAIT_MS;
    try {
      do {
        await RefreshTokenManager.waitForPendingRefresh(
          this.service,
          Math.max(0, deadline - Date.now()),
        );
        const [refresh, access] = await Promise.all([
          getRefreshToken(this.service),
          getAccessToken(this.service),
        ]);
        refreshToken = refresh ?? undefined;
        accessToken = access ?? undefined;
      } while (RefreshTokenManager.hasPendingRefresh(this.service) && Date.now() < deadline);
    } finally {
      await clearAuthTokens();
    }
    await this.api.post({
      url: authContract.paths.logout,
      data: { refreshToken },
      skipAuthRefresh: true,
      ...(accessToken && { headers: { authorization: `Bearer ${accessToken}` } }),
    });
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** Persist both tokens (async SecureStore): access for the Bearer header,
   * refresh for the refresh call. */
  private static async storeSession(result: AuthResult): Promise<AuthResult> {
    await persistAccessToken(result.tokens.accessToken, this.service);
    if (result.tokens.refreshToken) {
      await persistRefreshToken(result.tokens.refreshToken, this.service);
    }
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
