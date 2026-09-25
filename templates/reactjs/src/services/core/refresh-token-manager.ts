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

/** Performs the network refresh and resolves to the new tokens. */
export type TokenRefresher = () => Promise<RefreshedTokens>;

export interface RefreshTokenManagerOptions {
  service: ApiService;
  refresh: TokenRefresher;
  /** Called after a rotated pair was stored. */
  onRefreshed?: () => void;
  /** Fired once when the backend refuses the refresh (401/403): session gone. */
  onRefreshFailed: () => void;
  /** Re-checked once the lock is held: false (another tab logged out meanwhile)
   * aborts the refresh with `SessionEndedError`. */
  isSessionAlive?: () => boolean | Promise<boolean>;
}

/** Upper bound on how long logout waits for a running refresh (lock or in-tab). */
export const SESSION_WAIT_TIMEOUT_MS = 15_000;

/**
 * Web Lock name serializing refreshes (and logout) for one service across tabs.
 * Carries the app prefix so two apps on one origin never share a lock.
 */
export function refreshLockName(service: ApiService): string {
  return `${getAppPrefix()}:auth-refresh:${service}`;
}

/** In-flight refresh per service (this tab), for callers that must not overlap one. */
const pendingRefreshes = new Map<ApiService, Promise<unknown>>();

/** Run `task` under the service's Web Lock when available (all tabs share one
 * localStorage refresh token, and the backend revokes every session on refresh
 * token reuse); falls back to running it directly. */
async function withRefreshLock<T>(service: ApiService, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  // `await`: older DOM typings type `request` as resolving to the callback's promise.
  return locks?.request ? await locks.request(refreshLockName(service), task) : task();
}

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

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * page firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries with the new token.
 * Across tabs a Web Lock serializes refreshes; a tab that waited on the lock
 * re-reads the shared localStorage token and skips its own refresh when another
 * tab already rotated the pair meanwhile. Logout blocks new refreshes and waits
 * for a running one (`withSessionLock`), so it revokes the rotated pair; a
 * refresh that finishes after the session ended (epoch moved) stores nothing,
 * fires no hook — not even the failure hook — and rejects with `SessionEndedError`.
 */
export class RefreshTokenManager {
  private inFlight: Promise<string> | null = null;
  private readonly service: ApiService;
  private readonly refresh: TokenRefresher;
  private readonly onRefreshed: () => void;
  private readonly onRefreshFailed: () => void;
  private readonly isSessionAlive: () => boolean | Promise<boolean>;

  constructor(opts: RefreshTokenManagerOptions) {
    this.service = opts.service;
    this.refresh = opts.refresh;
    this.onRefreshed = opts.onRefreshed ?? (() => {});
    this.onRefreshFailed = opts.onRefreshFailed;
    this.isSessionAlive = opts.isSessionAlive ?? (() => true);
  }

  /**
   * Returns a fresh access token, deduplicating concurrent calls. `staleToken`
   * is the access token the failed request carried: when the stored token
   * already differs from it (another tab — or an earlier refresh in this one —
   * rotated it), that token is returned without a network refresh. Without a
   * `staleToken` (the request carried no Bearer) it always refreshes.
   * When the backend refuses the refresh (401/403) it clears this service's
   * tokens and fires the failure hook; any other failure keeps the tokens.
   * Either way the error is rethrown. The rotated pair is stored only while the
   * session epoch is unchanged.
   */
  getFreshToken(staleToken?: string | null): Promise<string> {
    // A logout is running: never start a rotation it could miss.
    if (isLogoutPending(this.service)) return Promise.reject(new SessionEndedError());
    if (this.inFlight) return this.inFlight;

    const epoch = getSessionEpoch(this.service);
    const ended = () => getSessionEpoch(this.service) !== epoch;

    const inFlight = withRefreshLock(this.service, async () => {
      // Logout ran or is running (here or in another tab) since we asked.
      if (ended() || isLogoutPending(this.service) || !(await this.isSessionAlive())) {
        throw new SessionEndedError();
      }
      // Another tab rotated the pair while we waited for the lock → reuse it.
      const current = getAccessToken(this.service);
      if (staleToken && current && current !== staleToken) return current;
      const tokens = await this.refresh();
      // The session ended (epoch moved) while the refresh was in flight: store nothing.
      if (ended()) throw new SessionEndedError();
      if (tokens.refreshToken) persistRefreshToken(tokens.refreshToken, this.service);
      persistAccessToken(tokens.accessToken, this.service);
      this.onRefreshed();
      return tokens.accessToken;
    })
      .catch((error: unknown) => {
        // Late result of a session that already ended: no hooks, just session_ended.
        if (ended() || error instanceof SessionEndedError) throw new SessionEndedError();
        if (isRefreshRefused(error)) {
          clearServiceTokens(this.service);
          this.onRefreshFailed();
        }
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
        if (pendingRefreshes.get(this.service) === inFlight) pendingRefreshes.delete(this.service);
      });

    this.inFlight = inFlight;
    pendingRefreshes.set(this.service, inFlight);
    return inFlight;
  }
}
