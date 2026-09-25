import { APP_PREFIX } from "@/enums";
import {
  clearServiceTokens,
  getAccessToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { getSessionEpoch, isLogoutPending } from "@/services/core/session-events";
import type { ApiService } from "@/services/core/types";

/** Tokens a refresh returned. The manager persists them — only when the
 * session is still the one that asked (see `getFreshToken`). */
export interface RefreshedTokens {
  accessToken: string;
  /** The rotated refresh token, when the backend returns one in the body. */
  refreshToken?: string;
}

/** Performs the network refresh and resolves to the new tokens. */
export type TokenRefresher = () => Promise<RefreshedTokens>;

interface RefreshTokenManagerOpts {
  service: ApiService;
  refresh: TokenRefresher;
  onRefreshFailed: () => void;
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

/** Every refresh running in this tab (all services), so logout can wait for them. */
const inFlightRefreshes = new Set<Promise<unknown>>();

/** Resolves once every refresh running in this tab has settled, or after
 * `maxWaitMs` — logout waits on it so a rotation already under way is stored
 * before the token is revoked (the only ordering available where the Web Locks
 * API is missing). */
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
 * ran — no token was persisted and no refresh request is made. Shaped like an
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
 * timeout, 429 or 5xx is transient: the tokens may still be valid, so the
 * caller keeps them and surfaces a retryable error instead.
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
 * (or logs out) at a time. Two tabs posting the same refresh token concurrently
 * would look like token reuse to the backend, which revokes every session. Runs
 * the task directly where the Web Locks API is unavailable (old browsers,
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

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * page firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries with the new token.
 * Across tabs a Web Lock serializes refreshes; a tab that waited on the lock
 * re-reads the shared localStorage token and skips its own refresh when another
 * tab already rotated the pair meanwhile. Logout blocks new refreshes, waits for
 * this tab's in-flight one (`settleInFlightRefreshes`) and takes the same lock,
 * so it runs after the rotated pair is stored and revokes that one; a refresh
 * that finishes after the session ended (epoch moved) stores nothing, fires no
 * hook — not even the failure hook — and rejects with `SessionEndedError`.
 */
export class RefreshTokenManager {
  private inFlight: Promise<string> | null = null;
  private readonly service: ApiService;
  private readonly refresh: TokenRefresher;
  private readonly onRefreshFailed: () => void;
  private readonly isSessionAlive: () => boolean;

  constructor(opts: RefreshTokenManagerOpts) {
    this.service = opts.service;
    this.refresh = opts.refresh;
    this.onRefreshFailed = opts.onRefreshFailed;
    this.isSessionAlive = opts.isSessionAlive ?? (() => true);
  }

  /**
   * Returns a fresh access token, deduplicating concurrent calls. `staleToken`
   * is the access token the failed request carried (defaults to the stored one).
   * When the backend refuses the refresh (401/403) it clears this service's
   * tokens and fires the failure hook; a transient failure (network, timeout,
   * 5xx, 429) keeps the tokens. Either way the error is rethrown. The rotated
   * pair is stored only while the session epoch is unchanged.
   */
  getFreshToken(staleToken: string | null = getAccessToken(this.service)): Promise<string> {
    // A logout is running: never start a rotation it could miss.
    if (isLogoutPending()) return Promise.reject(new SessionEndedError());
    if (this.inFlight) return this.inFlight;

    const epoch = getSessionEpoch();
    const ended = () => getSessionEpoch() !== epoch;

    this.inFlight = withSessionLock(this.service, async () => {
      // Logout ran or is running (here or in another tab) since we asked.
      if (ended() || isLogoutPending() || !this.isSessionAlive()) {
        throw new SessionEndedError();
      }
      // Another tab rotated the pair while we waited for the lock → reuse it.
      const current = getAccessToken(this.service);
      if (current && current !== staleToken) return current;
      const tokens = await this.refresh();
      // The session ended (epoch moved) while the refresh was in flight: store nothing.
      if (ended()) throw new SessionEndedError();
      if (tokens.refreshToken) persistRefreshToken(tokens.refreshToken, this.service);
      persistAccessToken(tokens.accessToken, this.service);
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
        inFlightRefreshes.delete(pending);
        this.inFlight = null;
      });

    const pending = this.inFlight;
    inFlightRefreshes.add(pending);
    return pending;
  }
}
