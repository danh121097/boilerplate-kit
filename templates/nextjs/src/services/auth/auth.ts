import { authContract } from "@/services/auth/contract";
import {
  beginLogout,
  bumpSessionEpoch,
  defineMutation,
  defineQuery,
  endSession,
  getSessionEpoch,
  hasSessionHint,
  isLogoutPending,
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
import type { SessionEndReason } from "@/services/core";

/** The revoke in flight, shared by concurrent callers (one POST, one event). */
let revoking: Promise<boolean> | null = null;

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

  /** The user signs out in this tab: revoke the refresh token server-side (sent
   * by cookie) and always end the client session — hint + cached queries — even
   * if the request fails. Ends as "logout": no return path. A revoke already in
   * flight has the same effect, so logout joins it instead of posting again. */
  static async logout(): Promise<void> {
    // A revoke that backs out (session already ended elsewhere) leaves this
    // one to be logged out normally.
    if (revoking && (await revoking)) return;
    await this.endServerSession("logout");
  }

  /**
   * The server rejected a live session outside a refused refresh (the session
   * read still 401s): revoke it like `logout`, best effort, but end it as
   * "expired" so the expiry redirect carries a return path. `sinceEpoch` is the
   * epoch seen when the rejected request started (undefined: no epoch check).
   * Resolves true when this call — or the in-flight one it joined — ended the
   * session; false when it had already ended (no hint, a logout running, or the
   * epoch moved): nothing is posted, whoever ended it already reset the client
   * state.
   */
  static revokeSession(sinceEpoch?: number): Promise<boolean> {
    revoking ??= this.endServerSession("expired", sinceEpoch)
      .catch(() => true) // best effort: the client session ended either way
      .finally(() => {
        revoking = null;
      });
    return revoking;
  }

  /** Shared by `logout` and `revokeSession`: revoke server-side, then end the
   * client session with `reason`. A revoke ("expired") stands down — resolving
   * false, nothing posted — when the session already ended: no hint, a logout
   * running, or (when `sinceEpoch` is given) the epoch moved. Resolves true once
   * it ended the session; a failed POST rejects after ending it.
   *
   * Ordering, so the token revoked is the latest one: from the first line no
   * refresh may start (a 401 meanwhile rejects with `session_ended` without
   * calling /auth/refresh). A refresh already running — in this tab, or holding
   * the lock in another — is waited out (15s cap), then the epoch is bumped in
   * the same tick as the POST starts, so anything still in flight persists
   * nothing. */
  private static async endServerSession(
    reason: SessionEndReason,
    sinceEpoch?: number,
  ): Promise<boolean> {
    if (reason === "expired") {
      const ended =
        !hasSessionHint() ||
        isLogoutPending(this.service) ||
        (sinceEpoch !== undefined && getSessionEpoch(this.service) !== sinceEpoch);
      if (ended) return false;
    }
    const done = beginLogout(this.service);
    try {
      await withSessionLock(this.service, async () => {
        bumpSessionEpoch(this.service);
        try {
          await this.api.post({ url: authContract.paths.logout });
        } finally {
          endSession(reason, this.service);
        }
      });
    } finally {
      done();
    }
    return true;
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** Current user, or null when signed out. A 401 resolves to null; while the
   * session is still live (hint set, not ended meanwhile) it is revoked first
   * (`revokeSession`, ends as "expired"). Other failures (network/5xx) still
   * throw so they are not cached as "signed out". Browser-only. */
  static async getSession(): Promise<AuthUser | null> {
    const epoch = getSessionEpoch(this.service);
    try {
      return await this.getMe();
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      await this.revokeSession(epoch);
      return null;
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
