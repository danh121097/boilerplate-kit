import { isRefreshRefused, SessionEndedError } from "@/services/core/api-errors";
import {
  clearServiceTokens,
  getAccessToken,
  persistRefreshedTokensIfCurrent,
} from "@/services/core/auth-token-storage";
import { getSessionEpoch, isLogoutPending } from "@/services/core/session";
import type { ApiService, RefreshedTokens } from "@/services/core/types";

/** Performs the network refresh and resolves to the newly minted tokens. It must
 * NOT persist them — the manager does, guarded by the session epoch. */
export type TokenRefresher = () => Promise<RefreshedTokens>;

export interface RefreshTokenManagerOptions {
  service: ApiService;
  refresh: TokenRefresher;
  /** Called after the rotated tokens were persisted. */
  onRefreshed?: () => void;
  /** Called once when the refresh endpoint refused the refresh (401/403),
   * after this service's tokens were cleared. */
  onRefreshFailed: () => void;
  /** Checked before refreshing: false means there is no session left to renew. */
  isSessionAlive?: () => boolean | Promise<boolean>;
}

/** Longest logout waits for an in-flight refresh before proceeding anyway. */
export const SESSION_WAIT_TIMEOUT_MS = 15_000;

/** In-flight refresh per service, for callers that must not overlap one. */
const pendingRefreshes = new Map<ApiService, Promise<unknown>>();

/**
 * Run `task` (logout) so it never overlaps a refresh of `service`: it starts
 * once the in-flight refresh(es) of that service settle — synchronously, with no
 * await, when none is pending. The wait is capped at `maxWaitMs`; past it the
 * task runs anyway, so a hung refresh can never block logout. React Native has
 * a single JS context and no tabs, so there is no cross-context lock.
 */
export async function withSessionLock<T>(
  service: ApiService,
  task: () => Promise<T>,
  { maxWaitMs = SESSION_WAIT_TIMEOUT_MS }: { maxWaitMs?: number } = {},
): Promise<T> {
  let pending = pendingRefreshes.get(service);
  if (!pending) return task();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(
      () => {
        timedOut = true;
        resolve();
      },
      Math.max(0, maxWaitMs),
    );
  });
  try {
    // A refresh started while this one ran (a queued 401) is waited out too.
    while (pending && !timedOut) {
      await Promise.race([pending.catch(() => {}), deadline]);
      pending = pendingRefreshes.get(service);
    }
  } finally {
    clearTimeout(timer);
  }
  return task();
}

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * screen firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries with the new token.
 *
 * Failure policy:
 * - refused (`isRefreshRefused`: the endpoint answered 401/403) → clear this
 *   service's tokens, fire `onRefreshFailed` (session expired), rethrow;
 * - anything else (offline, timeout, 429, 5xx, a malformed body) → keep the
 *   tokens and rethrow; the next 401 tries again.
 *
 * Logout race: the session epoch is read when the refresh starts. If a logout is
 * pending, or the session ended by the time the refresh would run or resolves,
 * it rejects with `SessionEndedError`: rotated tokens are not saved, and a
 * 401/403 does not clear or expire a newer session.
 */
export class RefreshTokenManager {
  private inFlight: Promise<string> | null = null;
  private readonly service: ApiService;
  private readonly refresh: TokenRefresher;
  private readonly onRefreshed?: () => void;
  private readonly onRefreshFailed: () => void;
  private readonly isSessionAlive?: () => boolean | Promise<boolean>;

  constructor(opts: RefreshTokenManagerOptions) {
    this.service = opts.service;
    this.refresh = opts.refresh;
    this.onRefreshed = opts.onRefreshed;
    this.onRefreshFailed = opts.onRefreshFailed;
    this.isSessionAlive = opts.isSessionAlive;
  }

  /**
   * Returns a fresh access token, deduplicating concurrent calls.
   *
   * @param staleToken The access token the failed request was sent with. When the
   * stored token already differs (an earlier refresh rotated it), that token is
   * returned without a network refresh.
   */
  getFreshToken(staleToken?: string | null): Promise<string> {
    // Logout in progress: never start (or join) a refresh — it would rotate the
    // token logout is revoking. No refresh call is made.
    if (isLogoutPending(this.service)) return Promise.reject(new SessionEndedError());
    if (this.inFlight) return this.inFlight;

    const epoch = getSessionEpoch(this.service);
    const inFlight = this.refreshUnlessRotated(epoch, staleToken).finally(() => {
      this.inFlight = null;
      if (pendingRefreshes.get(this.service) === inFlight) pendingRefreshes.delete(this.service);
    });
    this.inFlight = inFlight;
    pendingRefreshes.set(this.service, inFlight);

    return inFlight;
  }

  private async refreshUnlessRotated(epoch: number, staleToken?: string | null): Promise<string> {
    const service = this.service;
    // Re-checked after every await: SecureStore reads are async, and a logout
    // may land in between.
    const assertSameSession = () => {
      if (isLogoutPending(service) || getSessionEpoch(service) !== epoch) {
        throw new SessionEndedError();
      }
    };

    if (this.isSessionAlive && !(await this.isSessionAlive())) throw new SessionEndedError();
    assertSameSession();
    const current = await getAccessToken(service);
    assertSameSession();
    if (staleToken && current && current !== staleToken) return current;

    let tokens: RefreshedTokens;
    try {
      tokens = await this.refresh();
    } catch (error) {
      // The session this refresh belonged to is already gone (logout, maybe
      // followed by a new login): never clear or expire the newer session.
      if (getSessionEpoch(service) !== epoch) throw new SessionEndedError();
      if (isRefreshRefused(error)) await this.expire();
      throw error;
    }

    if (getSessionEpoch(service) !== epoch) throw new SessionEndedError();
    if (!(await persistRefreshedTokensIfCurrent(tokens, epoch, service))) {
      throw new SessionEndedError();
    }
    this.onRefreshed?.();
    return tokens.accessToken;
  }

  /** Refused refresh: clear this service's tokens, then fire the failure hook —
   * unless another session began while the clear was in flight. */
  private async expire(): Promise<void> {
    const clearing = clearServiceTokens(this.service); // bumps the epoch synchronously
    const clearedEpoch = getSessionEpoch(this.service);
    await clearing;
    if (getSessionEpoch(this.service) !== clearedEpoch) throw new SessionEndedError();
    this.onRefreshFailed();
  }
}
