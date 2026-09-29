import { authContract } from "@/services/auth/contract";
import { mockAuthAdapter } from "@/services/auth/mock-auth";
import {
  beginLogout,
  bumpSessionEpoch,
  defineMutation,
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
    Model.setup.call(this, {
      path: authContract.base,
      service: authContract.service,
      // Dev-only mock auth answers /auth/* in the browser; undefined otherwise.
      adapter: mockAuthAdapter,
    });
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
   * if the request fails. Ends as "logout": no return path. */
  static async logout(): Promise<void> {
    // A revoke in flight already ends this session: wait for it, post nothing.
    // If that revoke backs out (nothing to end), log out normally.
    if (revoking && (await revoking)) return;
    await this.endServerSession("logout");
  }

  /**
   * The server rejected a live session outside a refused refresh (the session
   * read still 401s): revoke it like `logout`, best effort, but end it as
   * "expired" so the expiry redirect carries a return path. `sinceEpoch` is the
   * epoch seen when the rejected request started (undefined: no epoch check).
   * Resolves true when this call — or the in-flight one it joined — ended the
   * session; false when it had already ended (server side, no hint, a logout
   * running, or the epoch moved): nothing is posted, whoever ended it already
   * reset the client state.
   */
  static revokeSession(sinceEpoch?: number): Promise<boolean> {
    // The server render has no session of its own to revoke.
    if (typeof document === "undefined") return Promise.resolve(false);
    if (sinceEpoch !== undefined && getSessionEpoch(this.service) !== sinceEpoch) {
      return Promise.resolve(false);
    }
    revoking ??= this.endServerSession("expired", sinceEpoch).finally(() => {
      revoking = null;
    });
    return revoking;
  }

  /** Shared by `logout` and `revokeSession`: revoke server-side, then end the
   * client session with `reason`. A revoke ("expired") backs out — resolving
   * false, nothing posted, no session end — when the session already ended: no
   * hint, a logout running, or the epoch moved since `sinceEpoch` (else since
   * this call started). It checks before waiting for the lock and again once it
   * holds it, so a refused refresh that ends the session meanwhile is not
   * ended twice. A revoke is best effort (a failed POST still ends the session
   * and resolves true); a logout whose POST fails rejects after ending it.
   * Logout never backs out.
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
    const service = this.service;
    const epoch = sinceEpoch ?? getSessionEpoch(service);
    const alreadyEnded = () => !hasSessionHint() || getSessionEpoch(service) !== epoch;
    if (reason === "expired" && (alreadyEnded() || isLogoutPending(service))) return false;
    const done = beginLogout(service);
    try {
      return await withSessionLock(service, async () => {
        if (reason === "expired" && alreadyEnded()) return false;
        bumpSessionEpoch(service);
        try {
          await this.api.post({ url: authContract.paths.logout });
        } catch (error) {
          if (reason === "logout") throw error;
        } finally {
          endSession(reason, service);
        }
        return true;
      });
    } finally {
      done();
    }
  }

  static async getMe(): Promise<AuthUser> {
    const res = await this.api.get<{ user: AuthUser }>({ url: authContract.paths.me });
    return res.data.user;
  }

  /** Current user, or null when signed out. A 401 resolves to null; while the
   * session is still live (hint set, not ended meanwhile) it is revoked first
   * (`revokeSession`, ends as "expired"). Other failures (network/5xx) still
   * throw so they are not cached as "signed out". Browser-only (axios client);
   * the session query uses the SSR-capable `fetchSession` in `./session`. */
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
// `routes/__root.tsx` resets the cache in place and pins `auth.me` to null.
export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
});
