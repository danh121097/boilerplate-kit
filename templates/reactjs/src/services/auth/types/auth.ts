/** Domain types for the Auth service — mirrors the backend auth module. */

import type { User } from "@/services/users/types/user";

/** The signed-in user: the backend's public user, same shape `/users` returns. */
export type AuthUser = User;

/** Both tokens come back in the login/register body; the client stores them and sends the refresh token in the refresh body. */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  name: string;
}

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
}
