/** Domain types for the Auth service — mirrors the backend auth module. */

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  role: string;
}

/** Only the access token is held client-side; the refresh token is cookie-only. */
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
