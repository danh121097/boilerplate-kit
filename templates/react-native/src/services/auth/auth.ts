import { authContract } from "@/services/auth/contract";
import { mockAuthAdapter } from "@/services/auth/data/mock-auth";
import {
  beginLogout,
  bumpSessionEpoch,
  clearAuthTokens,
  defineMutation,
  defineQuery,
  endSession,
  getAccessToken,
  getRefreshToken,
  getSessionEpoch,
  isLogoutPending,
  isSessionGoneError,
  Model,
  persistAccessToken,
  persistRefreshToken,
  withSessionLock,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type {
  AuthResult,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from "@/services/auth/types/auth";
import type { ApiService, SessionEndReason } from "@/services/core";

/** Both stored tokens of `service`; a failed SecureStore read counts as none. */
async function readTokenPair(service: ApiService) {
  const [access, refresh] = await Promise.all([
    getAccessToken(service).catch(() => null),
    getRefreshToken(service).catch(() => null),
  ]);
  return { access, refresh };
}

/** The revoke in flight, shared by concurrent callers (and awaited by logout). */
let revoking: Promise<boolean> | null = null;

export class AuthModel extends Model {
  static {
    Model.setup.call(this, {
      path: authContract.base,
      service: authContract.service,
      // Dev-only mock auth answers /auth/* in the app; undefined otherwise.
      adapter: mockAuthAdapter,
    });
  }

  static async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({ url: authContract.paths.login, data: payload });
    return this.storeSession(res.data);
  }

  static async register(payload: RegisterPayload): Promise<AuthResult> {
    const res = await this.api.post<AuthResult>({
      url: authContract.paths.register,
      data: payload,
    });
    return this.storeSession(res.data);
  }

  /**
   * Sign out (user action only): revoke the LATEST refresh token server-side,
   * then drop every stored token — even when the request fails — and end the
   * session as `logout` (no expiry, no return path). See `endServerSession`.
   */
  static async logout(): Promise<void> {
    // A revoke in flight already ends this session: wait for it, post nothing.
    // If that revoke backs out (nothing to end), log out normally.
    if (revoking && (await revoking)) return;
    await this.endServerSession("logout");
  }

  /**
   * The server rejected the session outside a refused refresh (a 401 on the
   * session query): revoke it like logout, but end it as `expired`, so the
   * auth gate sends the user to /login with a `redirect` of the current screen.
   *
   * Nothing is posted when the session already ended (logout pending, no token
   * stored, or — with `sinceEpoch`, the epoch the caller read before its
   * request — the epoch moved since): the caller only resets local state.
   * Best effort — a failed POST still clears the tokens. Concurrent callers
   * share one revoke. Resolves true when this call ended the session.
   */
  static revokeSession(sinceEpoch?: number): Promise<boolean> {
    if (sinceEpoch !== undefined && getSessionEpoch(this.service) !== sinceEpoch) {
      return Promise.resolve(false);
    }
    revoking ??= this.endServerSession("expired", sinceEpoch).finally(() => {
      revoking = null;
    });
    return revoking;
  }

  /**
   * The shared exit of `logout` and `revokeSession`:
   *
   * 1. Logout-pending from the first tick (before any await): no refresh starts
   *    while this waits or reads the tokens, and a 401 that would trigger one
   *    rejects with `session_ended`. The token reads start in the same tick
   *    (SecureStore is async) — that pair is the fallback below.
   * 2. Wait out any in-flight refresh (`withSessionLock`, capped at 15s) so the
   *    token revoked is the rotated one, not the one it replaced — a
   *    rotated-but-unrevoked token would stay valid on the server.
   * 3. Read both tokens again (falling back to the pair from step 1 when
   *    storage is empty by then) and bump the epoch: a refresh landing later
   *    writes nothing back.
   * 4. POST `{ refreshToken }` — in the body, the app has no cookie jar — with
   *    the captured access token as an explicit Bearer header. The logout path
   *    is a refresh `skipPaths` entry, so its 401 is never refreshed.
   * 5. Clear every stored token and `endSession(reason)`.
   *
   * A revoke (`expired`) backs out — resolves false, no POST, no end — when the
   * session already ended: a logout is running when it starts, or, re-checked
   * once the lock is held (a refused refresh may have ended it meanwhile), the
   * epoch moved since `sinceEpoch` (else since the call started) or no token is
   * stored. Its POST is best effort: a failure still clears and ends. Logout
   * never backs out and rethrows a failed POST (after clearing).
   */
  private static async endServerSession(
    reason: SessionEndReason,
    sinceEpoch?: number,
  ): Promise<boolean> {
    const service = this.service;
    const revoke = reason === "expired";
    if (revoke && isLogoutPending(service)) return false;
    const startEpoch = sinceEpoch ?? getSessionEpoch(service);
    const held = readTokenPair(service);
    const done = beginLogout(service);
    try {
      return await withSessionLock(service, async () => {
        const [stored, captured] = await Promise.all([readTokenPair(service), held]);
        if (revoke) {
          const signedOut = !stored.access && !stored.refresh;
          if (signedOut || getSessionEpoch(service) !== startEpoch) return false;
        }

        const accessToken = stored.access ?? captured.access;
        const refreshToken = stored.refresh ?? captured.refresh;
        bumpSessionEpoch(service);
        try {
          await this.api.post({
            url: authContract.paths.logout,
            data: { refreshToken: refreshToken ?? undefined },
            ...(accessToken && { headers: { authorization: `Bearer ${accessToken}` } }),
          });
        } catch (error) {
          if (!revoke) throw error;
        } finally {
          await clearAuthTokens();
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

  /** The signed-in user, or null when the session is gone (401, or 404 for a deleted account). Any other
   * failure (offline, 5xx, a transient refresh failure) rejects. */
  static async getSession(): Promise<AuthUser | null> {
    try {
      return await this.getMe();
    } catch (error) {
      if (isSessionGoneError(error)) return null;
      throw error;
    }
  }

  /** Persist both tokens (async SecureStore): access for the Bearer header,
   * refresh for the refresh call. */
  private static async storeSession(result: AuthResult): Promise<AuthResult> {
    await persistAccessToken(result.tokens.accessToken, this.service);
    if (result.tokens.refreshToken) {
      await persistRefreshToken(result.tokens.refreshToken, this.service);
    }
    return result;
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
});

export const useRegisterMutation = defineMutation<AuthResult, RegisterPayload>({
  key: queryKeys.auth.register,
  mutator: (payload) => AuthModel.register(payload),
});

export const useLogoutMutation = defineMutation({
  key: queryKeys.auth.logout,
  mutator: () => AuthModel.logout(),
  // Run even offline: a paused logout would never settle, leaving the user
  // signed in with a spinning button. The client signs out on settle anyway.
  options: { networkMode: "always" },
});
