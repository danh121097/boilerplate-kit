import {
  clearServiceTokens,
  getSessionEpoch,
  persistRefreshedTokensIfCurrent,
} from "@/services/core/auth-token-storage";
import { RefreshRejectedError, SessionClearedError } from "@/services/core/refresh-errors";
import type { RefreshedTokens } from "@/services/core/auth-token-storage";
import type { ApiService } from "@/services/core/types";

/** Performs the network refresh and resolves to the newly minted tokens. It must
 * NOT persist them — the manager does, guarded by the session epoch. */
export type TokenRefresher = () => Promise<RefreshedTokens>;

interface RefreshTokenManagerOpts {
  service: ApiService;
  refresh: TokenRefresher;
  onRefreshFailed: () => void;
}

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * screen firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries with the new token.
 *
 * Failure policy:
 * - `RefreshRejectedError` (endpoint answered 401/403) → clear this service's
 *   tokens and fire `onRefreshFailed` (session expired).
 * - Anything else (offline, timeout, 429, 5xx, ...) → keep the tokens and rethrow
 *   so the caller sees a retryable error; the next 401 tries again.
 *
 * Logout race: the session epoch is read before the network call; if the session
 * was cleared meanwhile, the outcome is discarded (`SessionClearedError`): rotated
 * tokens are not saved, and a 401/403 does not clear or expire a newer session.
 * `inFlight` is assigned synchronously, so the single-flight dedup is preserved.
 */
export class RefreshTokenManager {
  /** In-flight refresh per service, visible to logout (see `hasPendingRefresh`). */
  private static readonly pendingByService = new Map<ApiService, Promise<string>>();

  private inFlight: Promise<string> | null = null;
  private readonly service: ApiService;
  private readonly refresh: TokenRefresher;
  private readonly onRefreshFailed: () => void;

  constructor(opts: RefreshTokenManagerOpts) {
    this.service = opts.service;
    this.refresh = opts.refresh;
    this.onRefreshFailed = opts.onRefreshFailed;
  }

  /** True while a refresh for `service` is in flight. */
  static hasPendingRefresh(service: ApiService): boolean {
    return RefreshTokenManager.pendingByService.has(service);
  }

  /**
   * Resolve once the in-flight refresh for `service` (if any) settles, whatever
   * its outcome, or once `timeoutMs` elapses, whichever comes first. Logout awaits
   * this so it revokes the LATEST refresh token rather than one the refresh is
   * about to rotate away, without letting a hung refresh block sign-out forever.
   */
  static async waitForPendingRefresh(service: ApiService, timeoutMs?: number): Promise<void> {
    const pending = RefreshTokenManager.pendingByService.get(service);
    if (!pending) return;
    const settled = pending.then(
      () => undefined,
      () => undefined,
    );
    if (timeoutMs === undefined) return settled;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    });
    try {
      await Promise.race([settled, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Returns a fresh access token, deduplicating concurrent calls. */
  getFreshToken(): Promise<string> {
    if (this.inFlight) return this.inFlight;

    const epoch = getSessionEpoch(this.service);
    this.inFlight = this.refresh()
      .then(
        async (tokens) => {
          const saved = await persistRefreshedTokensIfCurrent(tokens, epoch, this.service);
          if (!saved) throw new SessionClearedError();
          return tokens.accessToken;
        },
        async (error: unknown) => {
          if (error instanceof RefreshRejectedError) {
            // The session this refresh belonged to is already gone (logout, maybe
            // followed by a new login): never clear or expire the newer session.
            if (getSessionEpoch(this.service) !== epoch) throw new SessionClearedError();
            await clearServiceTokens(this.service);
            this.onRefreshFailed();
          }
          throw error;
        },
      )
      .finally(() => {
        if (RefreshTokenManager.pendingByService.get(this.service) === this.inFlight) {
          RefreshTokenManager.pendingByService.delete(this.service);
        }
        this.inFlight = null;
      });
    RefreshTokenManager.pendingByService.set(this.service, this.inFlight);

    return this.inFlight;
  }
}
