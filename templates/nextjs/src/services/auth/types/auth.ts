/** Domain types for the Auth service — mirrors the backend auth module. */

import type { User } from "@/services/users/types/user";

/** The signed-in user: the backend's public user, same shape `/users` returns. */
export type AuthUser = User;

/** The login/register body also carries the tokens, but cookie mode never stores
 * them: the backend sets them as httpOnly cookies, so JS holds none. */
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
