import { useMeQuery } from "@/services/auth/auth";
import type { ApiResponseError } from "@/services/core/types";

/**
 * The session read failed for a reason that says nothing about the session — a
 * network error, timeout or 5xx (`retryable`). The user stays signed in as far
 * as this tab knows; a 401 resolves to a signed-out `null` instead and is never
 * an error, so it never counts.
 */
export function isSessionUnavailable(error: ApiResponseError | null | undefined): boolean {
  return Boolean(error?.retryable);
}

export function useAuth() {
  const session = useMeQuery();
  return {
    user: session.data ?? null,
    isAuthenticated: Boolean(session.data),
    isLoading: session.isPending,
    /** The session could not be restored right now — offer a retry. */
    sessionUnavailable: isSessionUnavailable(session.error),
    /** Re-run the session restore; the banner goes away once it succeeds. */
    retrySession: () => void session.refetch(),
  };
}
