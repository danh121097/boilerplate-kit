import { authContract } from "@/services/auth/contract";
import {
  beginLogout,
  bumpSessionEpoch,
  defineMutation,
  defineQuery,
  endSession,
  isUnauthorizedError,
  Model,
  SESSION_WAIT_TIMEOUT_MS,
  settleInFlightRefreshes,
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

  /** Revoke the refresh token server-side (sent by cookie) and always end the
   * client session — hint + cached queries — even if the request fails.
   *
   * Ordering, so the token revoked is the latest one: from the first line no
   * refresh may start (a 401 meanwhile rejects with `session_ended` without
   * calling /auth/refresh). A refresh already running — in this tab, or holding
   * the lock in another — is waited out (15s cap in total), then the epoch is
   * bumped in the same tick as the POST starts, so anything still in flight
   * persists nothing. */
  static async logout(): Promise<void> {
    const deadline = Date.now() + SESSION_WAIT_TIMEOUT_MS;
    const done = beginLogout();
    try {
      await settleInFlightRefreshes(SESSION_WAIT_TIMEOUT_MS);
      const maxWaitMs = Math.max(0, deadline - Date.now());
      await withSessionLock(
        this.service,
        async () => {
          bumpSessionEpoch();
          try {
            await this.api.post({ url: authContract.paths.logout });
          } finally {
            endSession("logout", this.service);
          }
        },
        { maxWaitMs },
      );
    } finally {
      done();
    }
  }
  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** Current user, or null when signed out. A 401 (anonymous, or a session whose
   * refresh failed) resolves to null; other failures (network/5xx) still throw
   * so they are not cached as "signed out". */
  static async getSession(): Promise<AuthUser | null> {
    try {
      return await this.getMe();
    } catch (error) {
      if (isUnauthorizedError(error)) return null;
      throw error;
    }
  }
}

// Queries
export const useMeQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: () => AuthModel.getSession(),
});

// Mutations
export const useLoginMutation = defineMutation<AuthResult, LoginPayload>({
  key: queryKeys.auth.login,
  mutator: (payload) => AuthModel.login(payload),
  invalidates: [queryKeys.auth.me],
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: queryKeys.auth.register,
  mutator: (payload) => AuthModel.register(payload),
  invalidates: [queryKeys.auth.me],
});

// No `invalidates`: logout ends the session, and the session-end listener in
// `app/providers.tsx` resets the cache in place and pins `auth.me` to null.
export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
});
