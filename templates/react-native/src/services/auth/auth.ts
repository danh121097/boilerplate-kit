import { authContract } from "@/services/auth/contract";
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
  isUnauthorizedError,
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

export class AuthModel extends Model {
  static {
    Model.setup.call(this, { path: authContract.base, service: authContract.service });
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
   * During an in-flight revoke it waits for that one instead: the same tokens
   * are revoked once and the session ends once (as `expired`).
   */
  static async logout(): Promise<void> {
    // A revoke that backs out (session already ended elsewhere) leaves this
    // one to be logged out normally.
    if (this.revoking && (await this.revoking)) return;
    await this.endServerSession("logout");
  }

  /**
   * The server rejected the session outside a refused refresh (a 401 on the
   * session query): revoke it like logout, but end it as `expired`, so the
   * auth gate sends the user to /login with a `returnTo` of the current screen.
   *
   * Nothing is posted when the session already ended (logout pending, no token
   * stored, or — with `sinceEpoch`, the epoch the caller read before its
   * request — the epoch moved since): the caller only resets local state.
   * Best effort — a failed POST still clears the tokens. Concurrent callers
   * share one revoke. Resolves true when this call ended the session.
   */
  static revokeSession(sinceEpoch?: number): Promise<boolean> {
    const service = this.service;
    const epoch = getSessionEpoch(service);
    if (sinceEpoch !== undefined && sinceEpoch !== epoch) return Promise.resolve(false);
    if (this.revoking) return this.revoking;
    if (isLogoutPending(service)) return Promise.resolve(false);
    this.revoking = this.endServerSession("expired", epoch)
      .catch(() => true) // the POST failed; the tokens are cleared and the session ended anyway
      .finally(() => {
        this.revoking = null;
      });
    return this.revoking;
  }

  private static revoking: Promise<boolean> | null = null;

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
   *    writes nothing back. With `sinceEpoch` (revoke), a session that already
   *    ended — epoch moved or nothing stored — is left alone: resolves false.
   * 4. POST `{ refreshToken }` — in the body, the app has no cookie jar — with
   *    the captured access token as an explicit Bearer header. The logout path
   *    is a refresh `skipPaths` entry, so its 401 is never refreshed.
   * 5. Clear every stored token and `endSession(reason)`.
   */
  private static async endServerSession(
    reason: SessionEndReason,
    sinceEpoch?: number,
  ): Promise<boolean> {
    const service = this.service;
    const held = readTokenPair(service);
    const done = beginLogout(service);
    try {
      return await withSessionLock(service, async () => {
        const [stored, captured] = await Promise.all([readTokenPair(service), held]);
        if (sinceEpoch !== undefined) {
          const signedOut = !stored.access && !stored.refresh;
          if (signedOut || getSessionEpoch(service) !== sinceEpoch) return false;
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

  /** The signed-in user, or null when the session is rejected (401). Any other
   * failure (offline, 5xx, a transient refresh failure) rejects. */
  static async getSession(): Promise<AuthUser | null> {
    try {
      return await this.getMe();
    } catch (error) {
      if (isUnauthorizedError(error)) return null;
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
});
