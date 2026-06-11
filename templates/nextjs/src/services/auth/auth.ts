import { authContract } from "./contract";
import { defineMutation, defineQuery, Model } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthResult, AuthUser, LoginPayload, RegisterPayload } from "./types/auth";

export class AuthModel extends Model {
  static {
    Model.setup.call(this, { path: authContract.base, service: authContract.service });
  }

  static async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: authContract.paths.login, data: payload });
    return res.data;
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.register,
      data: payload,
    });
    return res.data;
  }

  static async logout(): Promise<void> {
    await this.api.post({ url: authContract.paths.logout });
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
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
  invalidates: [queryKeys.auth.me],
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: queryKeys.auth.register,
  mutator: (payload) => AuthModel.register(payload),
  invalidates: [queryKeys.auth.me],
});

export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
  invalidates: [queryKeys.auth.me],
});
