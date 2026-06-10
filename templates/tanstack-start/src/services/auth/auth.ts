import { defineMutation, defineQuery, Model } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthResult, AuthUser, LoginPayload, RegisterPayload } from "./types/auth";

/**
 * Auth service for the MAIN backend (cookie-based).
 *
 * login/register/logout simply call the backend: it sets (and on logout clears)
 * the httpOnly access + refresh token cookies via Set-Cookie. The frontend never
 * reads or stores tokens — subsequent requests authenticate via the cookie
 * (the axios client uses `withCredentials`), and a 401 triggers a cookie-based
 * refresh in the interceptor.
 *
 * SSR note: this model is initialized client-side via initServices(). Server
 * functions that need auth context forward the request's cookie header directly,
 * not this client-side service.
 */
export class AuthModel extends Model {
  static {
    Model.setup.call(this, { path: "/auth" });
  }

  static async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: `${this.path}/login`, data: payload });
    return res.data;
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: `${this.path}/register`, data: payload });
    return res.data;
  }

  static async logout(): Promise<void> {
    // The backend clears the auth cookies on this call.
    await this.api.post({ url: `${this.path}/logout` });
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: `${this.path}/me` });
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
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: queryKeys.auth.register,
  mutator: (payload) => AuthModel.register(payload),
});

export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
});
