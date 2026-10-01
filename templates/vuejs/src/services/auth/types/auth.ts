/** Domain types for the Auth service — mirrors the backend auth module. */

import type { User } from "@/services/users/types/user";

/** The signed-in user: the backend's `PublicUser`, same shape as a `/users` row. */
export type AuthUser = User;

/** Access + refresh token pair. The client keeps both in localStorage (the refresh
 * token is sent in the refresh body); the backend also sets an httpOnly refresh cookie. */
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
