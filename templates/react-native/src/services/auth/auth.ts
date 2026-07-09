import { authContract } from "@/services/auth/contract";
import {
  clearAuthTokens,
  defineMutation,
  defineQuery,
  Model,
  persistAccessToken,
  persistRefreshToken,
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

  static async logout(): Promise<void> {
    try {
      await this.api.post({ url: authContract.paths.logout });
    } finally {
      await clearAuthTokens();
    }
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
