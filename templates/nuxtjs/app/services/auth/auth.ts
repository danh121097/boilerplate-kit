import { authContract } from "@/services/auth/contract";
import {
  beginLogout,
  bumpSessionEpoch,
  clearSessionHint,
  defineMutation,
  markSessionActive,
  Model,
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
    markSessionActive();
    return res.data;
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.register,
      data: payload,
    });
    markSessionActive();
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
   * landing afterwards does not re-mark the session. The hint is dropped even
   * when the call fails: this browser's session is over either way. */
  static async logout(): Promise<void> {
    const done = beginLogout();
    try {
      await withSessionLock(this.service, async () => {
        bumpSessionEpoch();
        try {
          await this.api.post({ url: authContract.paths.logout });
        } finally {
          clearSessionHint();
        }
      });
    } finally {
      done();
    }
  }

  /** Browser-side profile read — goes through the interceptors, so an expired
   * access cookie is refreshed and the request replayed. */
  static async getMe(): Promise<AuthUser | null> {
    const res = await this.api.get<{ user?: AuthUser }>({ url: authContract.paths.me });
    return res.data.user ?? null;
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

/** Callers clear the query cache on settle (`resetQueriesToSignedOut`) — nothing to
 * invalidate once every cached query is dropped. */
export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
});
