import { refreshUnavailable } from "@/services/core/interceptors";
import { isRefreshRefused, SessionEndedError } from "@/services/core/refresh-token-manager";
import type { ApiResponseError, ApiService } from "@/services/core/types";

/**
 * Bridge between server-function reads and the client refresh flow.
 *
 * Server functions run on the TanStack Start server, which normally never sees
 * the refresh cookie (the backend scopes it to `${apiPrefix}/auth`) and never
 * refreshes itself. So when a read finds no valid access cookie it returns
 * `ServerUnauthorized` instead of `null`, telling the caller whether a
 * session is believed to exist (the readable session hint). The query fetcher
 * wraps the call in `withSessionRefresh`, which — in the browser — refreshes
 * through the axios layer (the browser sends the refresh cookie to the backend)
 * and replays the server function once.
 */
export interface ServerUnauthorized {
  unauthorized: true;
  /** The request carried the session hint → worth a refresh, not "anonymous". */
  hasSession: boolean;
}

export function isServerUnauthorized(value: unknown): value is ServerUnauthorized {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { unauthorized?: unknown }).unauthorized === true
  );
}

type SessionRefresher = (service: ApiService) => Promise<void>;

let sessionRefresher: SessionRefresher | null = null;

/** Wire the client refresher (the interceptors' single-flight manager) once at boot. */
export function registerSessionRefresher(refresher: SessionRefresher): void {
  sessionRefresher = refresher;
}

/** Signed-out outcome, shaped like an API error so callers can branch on 401. */
function unauthorizedError(): ApiResponseError {
  return {
    status: "error",
    error_code: 401,
    message: "Unauthorized",
    error_message: "Unauthorized",
  };
}

/**
 * Run a server-function read; on `ServerUnauthorized` with a live session hint,
 * refresh in the browser and replay once. Rejects with a 401 `ApiResponseError`
 * when signed out (anonymous, or the refresh was refused — the refresh manager
 * has then ended the session); a transient refresh failure rejects with a
 * retryable non-401 error. During SSR a hinted session is NOT resolved to
 * "signed out": it rejects with a non-401 error so the query is not cached as
 * success and the browser refetches (and refreshes) on mount.
 */
export async function withSessionRefresh<T>(
  call: () => Promise<T | ServerUnauthorized>,
  service: ApiService = "MAIN",
): Promise<T> {
  const first = await call();
  if (!isServerUnauthorized(first)) return first;
  if (!first.hasSession) throw unauthorizedError();

  if (typeof window === "undefined") {
    throw new Error("Session refresh required — deferred to the browser");
  }
  if (!sessionRefresher) throw unauthorizedError();

  try {
    await sessionRefresher(service);
  } catch (error) {
    // Refused, or the session ended (logout) meanwhile → signed out. Transient
    // (network/5xx/429) → keep the session and surface a retryable, non-401
    // error so the query is not cached as signed-out.
    const signedOut = isRefreshRefused(error) || error instanceof SessionEndedError;
    throw signedOut ? unauthorizedError() : refreshUnavailable(error);
  }
  const second = await call();
  if (isServerUnauthorized(second)) throw unauthorizedError();
  return second;
}
