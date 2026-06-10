import type { ApiService } from "./types";

/** Performs the network refresh. The backend rotates the httpOnly token cookies
 * as a side effect, so the refresher resolves with no value. */
export type TokenRefresher = () => Promise<void>;

interface RefreshTokenManagerOpts {
  service: ApiService;
  refresh: TokenRefresher;
  onRefreshFailed: () => void;
}

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * page firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries. The refreshed
 * tokens live in httpOnly cookies set by the backend, so nothing is stored here.
 */
export class RefreshTokenManager {
  private inFlight: Promise<void> | null = null;
  private readonly doRefresh: TokenRefresher;
  private readonly onRefreshFailed: () => void;

  constructor(opts: RefreshTokenManagerOpts) {
    this.doRefresh = opts.refresh;
    this.onRefreshFailed = opts.onRefreshFailed;
  }

  /**
   * Runs the refresh, deduplicating concurrent calls. On failure it fires the
   * failure hook before rethrowing. On success the backend has rotated the
   * auth cookies, so the caller can simply replay its request.
   */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.doRefresh()
      .catch((error) => {
        this.onRefreshFailed();
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}
