import type { ApiService } from "@/services/core/types";

/**
 * "Session expired" notifications from the service layer to the app shell.
 *
 * The client interceptors fire this when a service's session is definitively
 * gone (the refresh endpoint rejected the refresh cookie, or a freshly refreshed
 * request is still 401). The service layer never reloads the page or touches the
 * router — `plugins/04.session-expiry.client.ts` subscribes once to clear the
 * query cache and route to /login.
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
