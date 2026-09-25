import { isRefreshRefused, SessionEndedError } from "@/services/core/api-errors";
import { getAppPrefix } from "@/services/core/app-prefix";
import { getSessionEpoch, isLogoutPending } from "@/services/core/session";
import type { ApiService } from "@/services/core/types";

/** Performs the network refresh. The backend rotates the httpOnly token cookies
 * as a side effect, so the refresher resolves with no value. */
export type TokenRefresher = () => Promise<void>;

export interface RefreshTokenManagerOptions {
  service: ApiService;
  refresh: TokenRefresher;
  /** Runs after a successful refresh (e.g. renew the session hint). */
  onRefreshed?: () => void;
  /** Fired once when the backend refuses the refresh (401/403): session over. */
  onRefreshFailed: () => void;
  /** Re-checked once the lock is held: false (another tab logged out meanwhile)
   * aborts the refresh with `SessionEndedError`. */
  isSessionAlive?: () => boolean | Promise<boolean>;
}

/** Upper bound on how long logout waits for a running refresh (lock or in-tab). */
export const SESSION_WAIT_TIMEOUT_MS = 15_000;

/**
 * Web Lock name serializing refreshes (and logout) for one service across tabs.
 * Carries the app prefix so two apps on one origin never share a lock;
 * `${name}:at` is the cross-tab "last refresh" localStorage key.
 */
export function refreshLockName(service: ApiService): string {
  return `${getAppPrefix()}:auth-refresh:${service}`;
}

function getLocks(): LockManager | undefined {
  return typeof navigator !== "undefined" ? navigator.locks : undefined;
}

/** Run `task` under the cross-tab Web Lock when available (every tab shares the
 * refresh cookie, and the backend revokes all sessions on refresh-token reuse);
 * falls back to running it directly (single-flight is then per tab only). */
async function withRefreshLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = getLocks();
  // `await`: older DOM typings type `request` as resolving to the callback's promise.
  return locks?.request ? await locks.request(name, task) : task();
}

/** In-flight refresh per service (this tab), for callers that must not overlap one. */
const pendingRefreshes = new Map<ApiService, Promise<unknown>>();

/**
 * Run `task` (logout) so it never overlaps a refresh of `service`: under the
 * shared Web Lock when available (it waits for any tab's in-flight refresh, and
 * a refresh queued behind it sees the ended session and persists nothing), else
 * after this tab's in-flight refresh settles. The wait is capped at `maxWaitMs`;
 * past it the task runs without the lock, so a hung refresh never blocks logout.
 */
export async function withSessionLock<T>(
  service: ApiService,
  task: () => Promise<T>,
  { maxWaitMs = SESSION_WAIT_TIMEOUT_MS }: { maxWaitMs?: number } = {},
): Promise<T> {
  const locks = getLocks();
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
  let started = false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxWaitMs);
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

/** A stored timestamp further ahead than this is treated as bogus (the clock
 * moved backwards since it was written) and ignored. */
const CLOCK_SKEW_TOLERANCE_MS = 1_000;

/** Cross-tab "last successful refresh" timestamp. The cookies themselves are
 * httpOnly (unreadable), so tabs share when they last rotated them instead. */
function readSharedTimestamp(key: string): number {
  try {
    return typeof localStorage === "undefined" ? 0 : Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeSharedTimestamp(key: string, value: number): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, String(value));
  } catch {
    // Storage blocked (private mode, quota) — the in-memory timestamp still applies.
  }
}

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * page firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries. Across tabs the
 * refresh runs under a Web Lock and is skipped when another tab rotated the
 * cookies after the failed request was sent (the replay then carries them).
 * While a logout runs no refresh starts (`SessionEndedError`); a refresh that
 * finishes after the session ended (epoch moved) persists nothing, fires no
 * hook — not even the failure hook — and rejects with `SessionEndedError`.
 */
export class RefreshTokenManager {
  private inFlight: Promise<void> | null = null;
  private refreshedAt = 0;
  private readonly service: ApiService;
  private readonly doRefresh: TokenRefresher;
  private readonly onRefreshed?: () => void;
  private readonly onRefreshFailed: () => void;
  private readonly isSessionAlive: () => boolean | Promise<boolean>;

  constructor(opts: RefreshTokenManagerOptions) {
    this.service = opts.service;
    this.doRefresh = opts.refresh;
    this.onRefreshed = opts.onRefreshed;
    this.onRefreshFailed = opts.onRefreshFailed;
    this.isSessionAlive = opts.isSessionAlive ?? (() => true);
  }

  /**
   * Runs the refresh, deduplicating concurrent calls.
   *
   * @param sentAt When the failed request was sent. If a refresh (this tab or
   * another) completed after that, the cookies are already fresh — skip it.
   *
   * A refused refresh (401/403) fires the failure hook (session over); any other
   * failure only rethrows (session kept). On success the caller replays its
   * request — the browser re-attaches the rotated cookies.
   */
  refresh(sentAt?: number): Promise<void> {
    // A logout is running: never start (or join) a rotation it could miss.
    if (isLogoutPending(this.service)) return Promise.reject(new SessionEndedError());
    if (this.inFlight) return this.inFlight;

    const epoch = getSessionEpoch(this.service);
    const lockName = refreshLockName(this.service);
    const inFlight = withRefreshLock(lockName, () =>
      this.refreshUnlessRotated(lockName, epoch, sentAt),
    ).finally(() => {
      this.inFlight = null;
      if (pendingRefreshes.get(this.service) === inFlight) pendingRefreshes.delete(this.service);
    });
    this.inFlight = inFlight;
    pendingRefreshes.set(this.service, inFlight);

    return inFlight;
  }

  private async refreshUnlessRotated(lockName: string, epoch: number, sentAt?: number) {
    // Logout ran or is running (here or in another tab) since we asked.
    const alive = await this.isSessionAlive();
    const ended = () => getSessionEpoch(this.service) !== epoch;
    if (!alive || ended() || isLogoutPending(this.service)) throw new SessionEndedError();

    // Timestamps in the future (clock moved back) prove nothing — ignore them
    // and refresh, rather than skipping and letting the session end.
    const limit = Date.now() + CLOCK_SKEW_TOLERANCE_MS;
    const lastRefresh = Math.max(
      0,
      ...[this.refreshedAt, readSharedTimestamp(`${lockName}:at`)].filter((t) => t <= limit),
    );
    if (sentAt !== undefined && lastRefresh > sentAt) return;

    try {
      await this.doRefresh();
    } catch (error) {
      // Late result of a session that already ended: no hooks, just session_ended.
      if (ended()) throw new SessionEndedError();
      if (isRefreshRefused(error)) this.onRefreshFailed();
      throw error;
    }

    // The session ended while the refresh was in flight: persist nothing.
    if (ended()) throw new SessionEndedError();

    this.refreshedAt = Date.now();
    writeSharedTimestamp(`${lockName}:at`, this.refreshedAt);
    this.onRefreshed?.();
  }
}
