import type { ApiResponseError } from "@/services/core/types";
import type { AxiosError } from "axios";

/**
 * A request failure that says nothing about the session — offline, timeout,
 * 408, rate limit (429) or a 5xx. Retrying later may succeed; the session is kept.
 */
export function isTransientHttpError(error: unknown): boolean {
  const e = error as { isAxiosError?: boolean; response?: { status?: number } } | null;
  if (!e?.isAxiosError) return false;
  const status = e.response?.status;
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
 * Whether a refresh failure means the backend REFUSED the session (HTTP 401/403
 * from the refresh endpoint). Only then is the session over. Anything else — a
 * network error, timeout, 408, 429, 5xx, even a 400 or a malformed body — is
 * transient: the cookies may still be valid, so the session is kept.
 */
export function isRefreshRefused(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}

/** A request that could not be replayed because the refresh itself failed
 * transiently. Deliberately NOT a 401, so callers keep the session. */
export function refreshUnavailable(error: unknown): ApiResponseError {
  const status = (error as { response?: { status?: number } } | null)?.response?.status ?? 0;
  const message = "refresh_unavailable";
  return { status: "error", error_code: status, message, error_message: message, retryable: true };
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
