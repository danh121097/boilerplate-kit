import { clearAuthTokens, defineMutation, defineQuery, Model, persistAuthToken } from "@/services/core";
import type { AuthResult, AuthUser, LoginPayload, RegisterPayload } from "./types/auth";

/**
 * Auth service for the MAIN backend. Access tokens are persisted for the Bearer
 * header; the refresh token is set/cleared by the server as an httpOnly cookie
 * (the client always sends cookies — see `withCredentials` in the Api client).
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

  /** Persist the access token so the request interceptor can attach it. */
  private static storeSession(result: AuthResult): AuthResult {
    persistAuthToken(result.tokens.accessToken, this.service);
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
