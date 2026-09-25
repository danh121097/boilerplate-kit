import { authContract } from "@/services/auth/contract";
import {
  beginLogout,
  bumpSessionEpoch,
  defineMutation,
  endSession,
  isUnauthorizedError,
  Model,
  startSession,
  withSessionLock,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type {
  AuthResult,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from "@/services/auth/types/auth";

export class AuthModel extends Model {
  static {
    Model.setup.call(this, { path: authContract.base, service: authContract.service });
  }

  static async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: authContract.paths.login, data: payload });
    startSession();
    return res.data;
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.register,
      data: payload,
    });
    startSession();
    return res.data;
  }

  /** The httpOnly refresh cookie (scoped to the auth routes) identifies the
   * session to revoke — there is no token to send from JS.
   *
   * Never overlaps a token refresh: an in-flight refresh finishes first (so the
   * cookie revoked is the latest rotated one; the wait is capped at 15s). The
   * session is marked as ending from the first tick and its epoch ends right
   * before the request, so a 401 arriving meanwhile rejects with
   * `session_ended` instead of rotating the cookie being revoked, and a refresh
   * landing afterwards does not re-mark the session. The session ends (hint
   * dropped, other tabs told, query cache reset) even when the call fails: this
   * browser's session is over either way. */
  static async logout(): Promise<void> {
    const service = this.service;
    const done = beginLogout(service);
    try {
      await withSessionLock(service, async () => {
        bumpSessionEpoch(service);
        try {
          await this.api.post({ url: authContract.paths.logout });
        } finally {
          endSession("logout", service);
        }
      });
    } finally {
      done();
    }
  }

  /** Browser-side profile read — goes through the interceptors, so an expired
   * access cookie is refreshed and the request replayed. */
  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** The signed-in user, or null when the session is rejected (401 — after the
   * interceptor's refresh attempt). Other failures (offline, 5xx) reject. */
  static async getSession(): Promise<AuthUser | null> {
    try {
      return await this.getMe();
    } catch (error) {
      if (isUnauthorizedError(error)) return null;
      throw error;
    }
  }
}

// Mutations

export const useLoginMutation = defineMutation<AuthResult, LoginPayload>({
  key: queryKeys.auth.login,
  mutator: (payload) => AuthModel.login(payload),
  invalidates: [queryKeys.auth.me, queryKeys.users.list],
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: queryKeys.auth.register,
  mutator: (payload) => AuthModel.register(payload),
  invalidates: [queryKeys.auth.me, queryKeys.users.list],
});

/** Logout ends the session, which resets every query to signed-out
 * (`04.session-expiry.client.ts`) — nothing to invalidate. */
export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
});
