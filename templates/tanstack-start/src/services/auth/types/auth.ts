/** Domain types for the Auth service — mirrors the backend auth module. */

import type { User } from "@/services/users/types/user";

/** The signed-in user: the backend `PublicUser`, same shape as a listed user. */
export type AuthUser = User;

/** Login / register return both tokens in the body and also set them as httpOnly
 * cookies; cookie-mode clients ignore the body copy (the cookies carry the session). */
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
