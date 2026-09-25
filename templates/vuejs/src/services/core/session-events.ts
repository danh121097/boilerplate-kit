import type { ApiService } from "@/services/core/types";

/**
 * "Session expired" notifications from the service layer to the app shell.
 *
 * The interceptors fire this when a service's session is definitively gone (the
 * refresh endpoint rejected the refresh token, or a freshly refreshed request is
 * still 401). The service layer never reloads the page or touches the router —
 * the app subscribes once (see `plugins/session-expiry.ts`) to clear its state
 * and route to /login.
 */
type SessionExpiredListener = (service: ApiService) => void;

const listeners = new Set<SessionExpiredListener>();

/** Subscribe to session expiry; returns an unsubscribe function. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySessionExpired(service: ApiService): void {
  listeners.forEach((listener) => listener(service));
}
