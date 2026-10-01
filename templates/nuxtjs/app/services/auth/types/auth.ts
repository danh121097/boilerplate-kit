/** Domain types for the Auth service — mirrors the backend auth module. */

import type { User } from "@/services/users/types/user";

/** The signed-in user: the backend `PublicUser`, same shape as a listed user. */
export type AuthUser = User;

/** Token pair the backend also returns in the body. Cookie mode never reads it:
 * the httpOnly cookies carry the session, so nothing is held client-side. */
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
