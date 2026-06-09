import {
  clearAuthTokens,
  defineMutation,
  defineQuery,
  Model,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core";
import type { AuthResult, AuthUser, LoginPayload, RegisterPayload } from "./types/auth";

/**
 * Auth service for the MAIN backend. Both tokens are persisted in localStorage:
 * the access token feeds the Bearer header; the refresh token is replayed in the
 * refresh request body. `logout` clears both. (The backend may also set an
 * httpOnly refresh cookie — harmless and still honored via `withCredentials`.)
 *
 * The response interceptor already unwraps the backend envelope, so a method
 * typed `post<T>` resolves to the payload `T` via a single `.data` — pass the
 * PAYLOAD type as `T` (not the `{ data }` envelope) and read `.data` once.
 */
export class AuthModel extends Model {
  static {
    Model.setup.call(this, { path: "/auth" });
  }

  static async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: `${this.path}/login`, data: payload });
    return this.storeSession(res.data);
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: `${this.path}/register`, data: payload });
    return this.storeSession(res.data);
  }

  static async logout(): Promise<void> {
    try {
      await this.api.post({ url: `${this.path}/logout` });
    } finally {
      clearAuthTokens();
    }
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: `${this.path}/me` });
    return res.data.user;
  }

  /** Persist both tokens: access for the Bearer header, refresh for the refresh call. */
  private static storeSession(result: AuthResult): AuthResult {
    persistAccessToken(result.tokens.accessToken, this.service);
    if (result.tokens.refreshToken) persistRefreshToken(result.tokens.refreshToken, this.service);
    return result;
  }
}

export const useLoginMutation = defineMutation<AuthResult, LoginPayload>({
  key: "auth.login",
  mutator: (payload) => AuthModel.login(payload),
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: "auth.register",
  mutator: (payload) => AuthModel.register(payload),
});

export const useLogoutMutation = defineMutation({
  key: "auth.logout",
  mutator: () => AuthModel.logout(),
});

export const useMeQuery = defineQuery<AuthUser>({
  key: "auth.me",
  fetcher: () => AuthModel.getMe(),
});
