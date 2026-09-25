import { APP_PREFIX } from "@/enums";
import { getSessionEpoch, isLogoutPending } from "@/services/core/session";
import type { ApiService } from "@/services/core/types";

/** Performs the network refresh. The backend rotates the httpOnly token cookies
 * as a side effect, so the refresher resolves with no value. */
export type TokenRefresher = () => Promise<void>;

interface RefreshTokenManagerOpts {
  service: ApiService;
  refresh: TokenRefresher;
  onRefreshFailed: () => void;
  /** Runs after a successful refresh (e.g. renew the session hint). */
  onRefreshed?: () => void;
  /** Re-checked once the lock is held: false (another tab logged out meanwhile)
   * aborts the refresh with `SessionEndedError`. */
  isSessionAlive?: () => boolean;
}

/** Upper bound on how long logout waits for a running refresh (lock or in-tab). */
export const SESSION_WAIT_TIMEOUT_MS = 15_000;

/**
 * Web Lock name serializing refreshes (and logout) for one service across tabs.
 * Carries the app prefix so two apps on one origin never share a lock.
 */
export function refreshLockName(service: ApiService): string {
  return `${APP_PREFIX}:auth-refresh:${service}`;
}

/** localStorage key of the shared "last successful refresh" stamp:
 * `${APP_PREFIX}:auth-refresh:${service}:at` (the lock name plus `:at`). */
function lastRefreshKey(service: ApiService): string {
  return `${refreshLockName(service)}:at`;
}

/** Every refresh running in this tab (all services), so logout can wait for them. */
const inFlightRefreshes = new Set<Promise<unknown>>();

/** Resolves once every refresh running in this tab has settled, or after
 * `maxWaitMs` — logout waits on it so a rotation already under way lands before
 * the token is revoked (the only ordering available without the Web Locks API). */
export function settleInFlightRefreshes(maxWaitMs = SESSION_WAIT_TIMEOUT_MS): Promise<void> {
  if (inFlightRefreshes.size === 0) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, maxWaitMs);
  });
  const settled = Promise.allSettled([...inFlightRefreshes]).then(() => undefined);
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The session ended (logout, here or in another tab) before or while a refresh
 * ran — nothing was persisted and no refresh request is made. Shaped like an
 * API error (`{ error_code: 401, message: "session_ended" }`) so callers branch
 * on it like any other 401.
 */
export class SessionEndedError extends Error {
  readonly status = "error";
  readonly error_code = 401;
  readonly error_message = "session_ended";

  constructor() {
    super("session_ended");
    this.name = "SessionEndedError";
  }
}

/**
 * Whether a refresh failure means the backend REFUSED the session (HTTP 401/403
 * from the refresh endpoint). Only then is the session over. A network error,
 * timeout, 429 or 5xx is transient: the cookies may still be valid, so the
 * session hint is kept and the caller surfaces a retryable error instead.
 */
export function isRefreshRefused(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}

interface SessionLockOptions {
  /** Give up waiting for the lock after this long and run the task without it. */
  maxWaitMs?: number;
}

/**
 * Run `task` under the service's browser-wide Web Lock so only ONE tab refreshes
 * (or logs out) at a time. Two tabs posting the same refresh cookie concurrently
 * would look like token reuse to the backend, which revokes every session. Runs
 * the task directly where the Web Locks API is unavailable (old browsers, SSR,
 * tests) — single-flight is then per tab only.
 */
export function withSessionLock<T>(
  service: ApiService,
  task: () => Promise<T>,
  { maxWaitMs }: SessionLockOptions = {},
): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return task();
  const name = refreshLockName(service);
  if (maxWaitMs === undefined) return locks.request(name, task) as Promise<T>;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxWaitMs);
  return (
    locks.request(name, { signal: controller.signal }, () => {
      clearTimeout(timer);
      return task();
    }) as Promise<T>
  ).catch((error: unknown) => {
    // Waited too long for the lock: proceed without it.
    if (controller.signal.aborted && (error as { name?: string } | null)?.name === "AbortError") {
      return task();
    }
    throw error;
  });
}

/** Epoch ms of the last successful refresh in ANY tab (shared via localStorage). */
function readLastRefresh(service: ApiService): number {
  try {
    return Number(localStorage.getItem(lastRefreshKey(service))) || 0;
  } catch {
    return 0;
  }
}

function writeLastRefresh(service: ApiService, at: number): void {
  try {
    localStorage.setItem(lastRefreshKey(service), String(at));
  } catch {
    // Storage unavailable (private mode / SSR) — cross-tab skip degrades to a refresh.
  }
}

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * page firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries. Across tabs a
 * Web Lock serializes refreshes; a tab that waited on the lock re-checks the
 * shared "last refresh" stamp and skips its own refresh when another tab already
 * rotated the cookies meanwhile (the browser jar is shared, so it can just replay).
 * While a logout runs no refresh starts (`SessionEndedError`); a refresh that
 * finishes after the session ended (epoch moved) persists nothing, fires no
 * hook — not even the failure hook — and rejects with `SessionEndedError`.
 */
export class RefreshTokenManager {
  private inFlight: Promise<void> | null = null;
  private readonly service: ApiService;
  private readonly doRefresh: TokenRefresher;
  private readonly onRefreshFailed: () => void;
  private readonly onRefreshed?: () => void;
  private readonly isSessionAlive: () => boolean;

  constructor(opts: RefreshTokenManagerOpts) {
    this.service = opts.service;
    this.doRefresh = opts.refresh;
    this.onRefreshFailed = opts.onRefreshFailed;
    this.onRefreshed = opts.onRefreshed;
    this.isSessionAlive = opts.isSessionAlive ?? (() => true);
  }

  /**
   * Runs the refresh, deduplicating concurrent calls. When the backend refuses
   * the refresh (401/403) it fires the failure hook (session over); a transient
   * failure only rethrows. On success the backend has rotated the
   * auth cookies, so the caller can simply replay its request.
   */
  refresh(): Promise<void> {
    // A logout is running: never start a rotation it could miss.
    if (isLogoutPending()) return Promise.reject(new SessionEndedError());
    if (this.inFlight) return this.inFlight;

    const requestedAt = Date.now();
    const epoch = getSessionEpoch();
    const ended = () => getSessionEpoch() !== epoch;

    this.inFlight = withSessionLock(this.service, async () => {
      // Logout ran or is running (here or in another tab) since we asked.
      if (ended() || isLogoutPending() || !this.isSessionAlive()) {
        throw new SessionEndedError();
      }
      // Another tab rotated the cookies while we waited for the lock → reuse them.
      if (readLastRefresh(this.service) > requestedAt) return;
      await this.doRefresh();
      // The session ended (epoch moved) while the refresh was in flight: persist nothing.
      if (ended()) throw new SessionEndedError();
      writeLastRefresh(this.service, Date.now());
    })
      .then(
        () => {
          if (ended()) throw new SessionEndedError();
          this.onRefreshed?.();
        },
        (error: unknown) => {
          // Late result of a session that already ended: no hooks, just session_ended.
          if (ended() || error instanceof SessionEndedError) throw new SessionEndedError();
          if (isRefreshRefused(error)) this.onRefreshFailed();
          throw error;
        },
      )
      .finally(() => {
        inFlightRefreshes.delete(pending);
        this.inFlight = null;
      });

    const pending = this.inFlight;
    inFlightRefreshes.add(pending);
    return pending;
  }
}
