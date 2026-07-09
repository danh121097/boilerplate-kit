/** Domain types for the Auth service — mirrors the backend auth module. */

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  role: string;
}

/** Both tokens are held client-side in SecureStore (access for the Bearer header,
 * refresh for the refresh request body). */
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
