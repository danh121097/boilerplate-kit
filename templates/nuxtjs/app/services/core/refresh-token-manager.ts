import { clearAuthToken, persistAuthToken } from "./auth-token-storage";
import type { ApiService } from "./types";

/** Performs the network refresh and resolves to a new access token. */
export type TokenRefresher = () => Promise<string>;

interface RefreshTokenManagerOpts {
  service: ApiService;
  refresh: TokenRefresher;
  onRefreshFailed: () => void;
}

/**
 * Serializes token refreshes for ONE service. A burst of concurrent 401s (e.g. a
 * page firing several requests at once) triggers exactly ONE network refresh —
 * every caller awaits the same in-flight promise, then retries with the new token.
 */
export class RefreshTokenManager {
  private inFlight: Promise<string> | null = null;
  private readonly service: ApiService;
  private readonly refresh: TokenRefresher;
  private readonly onRefreshFailed: () => void;

  constructor(opts: RefreshTokenManagerOpts) {
    this.service = opts.service;
    this.refresh = opts.refresh;
    this.onRefreshFailed = opts.onRefreshFailed;
  }

  /**
   * Returns a fresh access token, deduplicating concurrent calls. On failure it
   * clears this service's token and fires the failure hook before rethrowing.
   */
  getFreshToken(): Promise<string> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.refresh()
      .then((token) => {
        persistAuthToken(token, this.service);
        return token;
      })
      .catch((error) => {
        clearAuthToken(this.service);
        this.onRefreshFailed();
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}
