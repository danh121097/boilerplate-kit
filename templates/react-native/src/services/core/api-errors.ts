import type { ApiResponseError } from "@/services/core/types";
import type { AxiosError } from "axios";

/**
 * Error helpers shared by the interceptors, the refresh manager and the app.
 * Rejections are plain `ApiResponseError` objects (or `SessionEndedError`, which
 * carries the same fields), so callers branch on `error_code` / `retryable`.
 */

/** HTTP status of an axios rejection, or undefined when there was no response. */
function httpStatusOf(error: unknown): number | undefined {
  const e = error as { isAxiosError?: boolean; response?: { status?: number } } | null;
  return e?.isAxiosError ? e.response?.status : undefined;
}

/**
 * A request failure that says nothing about the session — offline, timeout,
 * 408, rate limit (429) or a 5xx. Retrying later may succeed; the session is kept.
 */
export function isTransientHttpError(error: unknown): boolean {
  if (!(error as { isAxiosError?: boolean } | null)?.isAxiosError) return false;
  const status = httpStatusOf(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/** Normalize any rejection into the `ApiResponseError` shape callers branch on,
 * keeping the HTTP status in `error_code` (e.g. 401 → session rejected, 0 →
 * unreachable). Transient failures carry `retryable: true`. */
export function toApiError(error: unknown): ApiResponseError {
  const e = error as AxiosError<ApiResponseError> | undefined;
  const raw: unknown = e?.response?.data;
  const data = raw && typeof raw === "object" ? (raw as Partial<ApiResponseError>) : undefined;
  const message = data?.message ?? (error instanceof Error ? error.message : "request_failed");
  return {
    ...data,
    status: data?.status ?? "error",
    message,
    error_message: data?.error_message ?? message,
    error_code:
      data?.error_code ??
      e?.response?.status ??
      (error as { error_code?: number } | null)?.error_code ??
      0,
    ...(isTransientHttpError(error) ? { retryable: true } : {}),
  };
}

/** True when a rejection means the session was rejected (HTTP / envelope 401) —
 * as opposed to a network error, timeout or 5xx, which say nothing about it. */
export function isUnauthorizedError(error: unknown): boolean {
  return (error as Partial<ApiResponseError> | null)?.error_code === 401;
}

/**
 * The refresh endpoint refused the refresh token (HTTP 401 or 403): the session
 * is over. Every other refresh failure — offline, timeout, 408, 429, 5xx, any
 * other 4xx, a 200 without an access token — is transient and keeps the session.
 */
export function isRefreshRefused(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status === 401 || status === 403;
}

/** The rejection for a request whose refresh failed transiently: retryable, and
 * `error_code` carries the refresh call's HTTP status (0 when it never answered). */
export function refreshUnavailable(error: unknown): ApiResponseError {
  const message = "refresh_unavailable";
  return {
    status: "error",
    error_code: httpStatusOf(error) ?? 0,
    message,
    error_message: message,
    retryable: true,
  };
}

/**
 * The message to show a user for a failed call: the server's `error_message` /
 * `message` when it sent one (e.g. "Invalid credentials" on a login 401), else
 * `fallback`. Rejections are plain `ApiResponseError` objects, not `Error`s.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const e = error as Partial<ApiResponseError> | null;
  const message = e?.error_message || e?.message || (error instanceof Error ? error.message : "");
  return typeof message === "string" && message && message !== "request_failed"
    ? message
    : fallback;
}

/**
 * The session ended (logout or expiry) while a refresh or a request was in
 * flight: nothing was saved and no refresh is attempted for it. Not a refresh
 * failure — no session-ended event is fired for it.
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
