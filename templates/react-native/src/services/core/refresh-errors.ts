/**
 * Outcomes of a failed token refresh. Only an explicit rejection by the refresh
 * endpoint ends the session; everything else (offline, timeout, 429, 5xx, a
 * malformed body) is transient — tokens are kept and the caller may retry.
 */

/** HTTP statuses on the refresh endpoint that mean the refresh token is dead. */
const SESSION_REJECTED_STATUSES = new Set([401, 403]);

/** The refresh endpoint answered 401/403: the refresh token is invalid or revoked. */
export class RefreshRejectedError extends Error {
  readonly status = "error";
  /** The rejecting HTTP status (401 or 403). */
  readonly error_code: number;
  readonly error_message = "refresh_rejected";

  constructor(httpStatus: number) {
    super(`Refresh rejected by server (${httpStatus})`);
    this.name = "RefreshRejectedError";
    this.error_code = httpStatus;
  }
}

/**
 * The refresh could not complete for a transient reason. Tokens are untouched;
 * `retryable` lets UI/query layers show "try again" instead of forcing a login.
 * All three errors share the `ApiResponseError` envelope fields (`status`,
 * `message`, `error_code`, `error_message`) so UI error rendering is uniform.
 */
export class RefreshUnavailableError extends Error {
  readonly retryable = true;
  readonly status = "error";
  /** HTTP status when the server answered (e.g. 429, 503), 0 when it never did. */
  readonly error_code: number;
  readonly error_message: string;

  constructor(httpStatus = 0, reason = "refresh_unavailable") {
    super(reason);
    this.name = "RefreshUnavailableError";
    this.error_code = httpStatus;
    this.error_message = reason;
  }
}

/**
 * The session was cleared (logout / expiry) while a refresh or a request was in
 * flight: nothing was saved and no refresh is attempted for it.
 */
export class SessionClearedError extends Error {
  readonly status = "error";
  readonly error_code = 401;
  readonly error_message = "session_ended";

  constructor() {
    super("session_ended");
    this.name = "SessionClearedError";
  }
}

/** True when an HTTP status from the refresh endpoint means the session is over. */
export function isSessionRejectedStatus(status: number | undefined): boolean {
  return status !== undefined && SESSION_REJECTED_STATUSES.has(status);
}
