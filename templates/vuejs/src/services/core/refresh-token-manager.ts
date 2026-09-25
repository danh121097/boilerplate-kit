import { isRefreshRefused, SessionEndedError } from "@/services/core/api-errors";
import { getAppPrefix } from "@/services/core/app-prefix";
import {
  clearServiceTokens,
  getAccessToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { getSessionEpoch, isLogoutPending } from "@/services/core/session";
import type { ApiService, RefreshedTokens } from "@/services/core/types";

/** Performs the network refresh and resolves to the rotated token pair. */
export type TokenRefresher = () => Promise<RefreshedTokens>;

export interface RefreshTokenManagerOptions {
  service: ApiService;
  refresh: TokenRefresher;
  /** Fired after a successful network refresh. */
  onRefreshed?: () => void;
  /** Fired once when the backend refuses the refresh (401/403 — session gone). */
  onRefreshFailed: () => void;
  /** Checked once the lock is held: false means the session was cleared (e.g.
   * another tab logged out while this one waited) — no network refresh. */
  isSessionAlive?: () => boolean | Promise<boolean>;
}

/** Longest a logout waits for an in-flight refresh (lock or in-tab) before
 * proceeding anyway. */
export const SESSION_WAIT_TIMEOUT_MS = 15_000;

/** Web Lock name shared by the refresh and logout of one service — app-prefixed
 * (same prefix as the storage keys) so several apps on one origin never share it. */
export function refreshLockName(service: ApiService): string {
  return `${getAppPrefix()}:auth-refresh:${service}`;
}

/** Run `task` under a cross-tab Web Lock when available (all tabs share one
 * localStorage refresh token, and the backend revokes every session on refresh
 * token reuse); falls back to running it directly. */
async function withRefreshLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  // `await`: older DOM typings type `request` as resolving to the callback's promise.
  return locks?.request ? await locks.request(name, task) : task();
}

/** In-flight refresh per service (this tab), for callers that must not overlap one. */
const pendingRefreshes = new Map<ApiService, Promise<unknown>>();

/**
 * Run `task` (logout) so it never overlaps a refresh of `service`: under the
 * shared Web Lock when available (it waits for any tab's in-flight refresh, and a
 * refresh queued behind it sees the ended session and persists nothing), else
 * after this tab's in-flight refresh settles. The wait is capped at
 * `SESSION_WAIT_TIMEOUT_MS`; past it the task runs without the lock, so a hung
 * refresh can never block logout.
 */
export async function withSessionLock<T>(
  service: ApiService,
  task: () => Promise<T>,
  { maxWaitMs = SESSION_WAIT_TIMEOUT_MS }: { maxWaitMs?: number } = {},
): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) return withCappedLock(locks, refreshLockName(service), task, maxWaitMs);

  // No locks: wait out this tab's in-flight refresh(es); with none pending the
  // task starts synchronously (no await before it).
  let pending = pendingRefreshes.get(service);
  if (!pending) return task();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, maxWaitMs);
  });
  try {
    while (pending && !timedOut) {
      await Promise.race([pending.catch(() => {}), deadline]);
      pending = pendingRefreshes.get(service);
    }
  } finally {
    clearTimeout(timer);
  }
  return task();
}

/** `locks.request` whose wait for the lock is aborted after `maxWaitMs`; the
 * task then runs unlocked. */
async function withCappedLock<T>(
  locks: LockManager,
  name: string,
  task: () => Promise<T>,
  maxWaitMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxWaitMs);
  let started = false;
  try {
    return await locks.request(name, { signal: controller.signal }, () => {
      started = true;
      clearTimeout(timer);
      return task();
    });
  } catch (error) {
    if (!started && controller.signal.aborted) return task();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * page firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries with the new token.
 * Across tabs, the refresh runs under a Web Lock and is skipped when another tab
 * already rotated the token while this one waited. A refresh whose session was
 * cleared meanwhile (logout) persists nothing.
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
   * stored token already differs (another tab — or an earlier refresh in this one —
   * rotated it), that token is returned without a network refresh.
   *
   * A refused refresh (401/403) clears this service's tokens, fires the failure
   * hook and rethrows; any other failure rethrows and keeps the tokens. If the
   * session is cleared while the refresh runs, it rejects with `SessionEndedError`.
   */
  getFreshToken(staleToken?: string | null): Promise<string> {
    // Logout in progress: never start (or join) a refresh — it would rotate the
    // token logout is revoking. No /auth/refresh call is made.
    if (isLogoutPending(this.service)) return Promise.reject(new SessionEndedError());
    if (this.inFlight) return this.inFlight;

    const epoch = getSessionEpoch(this.service);
    const inFlight = withRefreshLock(refreshLockName(this.service), () =>
      this.refreshUnlessRotated(epoch, staleToken),
    ).finally(() => {
      this.inFlight = null;
      if (pendingRefreshes.get(this.service) === inFlight) pendingRefreshes.delete(this.service);
    });
    this.inFlight = inFlight;
    pendingRefreshes.set(this.service, inFlight);

    return inFlight;
  }

  /** Logout ran (or is running) since `epoch` was captured. */
  private sessionEnded(epoch: number): boolean {
    return isLogoutPending(this.service) || getSessionEpoch(this.service) !== epoch;
  }

  private async refreshUnlessRotated(epoch: number, staleToken?: string | null): Promise<string> {
    // Logged out (or logging out) while waiting for the lock: nothing to refresh.
    if (this.sessionEnded(epoch)) throw new SessionEndedError();
    // The session was cleared — by this tab, or by another tab's logout (shared
    // storage) while this refresh waited for the lock.
    const alive = this.isSessionAlive?.() ?? true;
    if (!(alive instanceof Promise ? await alive : alive) || this.sessionEnded(epoch)) {
      throw new SessionEndedError();
    }

    const current = getAccessToken(this.service);
    if (staleToken && current && current !== staleToken) return current;

    let tokens: RefreshedTokens;
    try {
      tokens = await this.refresh();
    } catch (error) {
      if (getSessionEpoch(this.service) !== epoch) throw new SessionEndedError();
      if (isRefreshRefused(error)) {
        clearServiceTokens(this.service);
        this.onRefreshFailed();
      }
      throw error;
    }

    // Logged out while the call was in flight: never write the tokens back.
    if (getSessionEpoch(this.service) !== epoch) throw new SessionEndedError();

    if (tokens.refreshToken) persistRefreshToken(tokens.refreshToken, this.service);
    persistAccessToken(tokens.accessToken, this.service);
    this.onRefreshed?.();
    return tokens.accessToken;
  }
}
