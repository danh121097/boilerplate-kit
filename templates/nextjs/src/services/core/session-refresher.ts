import type { ApiService } from "@/services/core/types";

/** Refreshes `service`; skipped when a refresh finished after `sentAt`. */
type SessionRefresher = (service: ApiService, sentAt?: number) => Promise<void>;

let sessionRefresher: SessionRefresher | null = null;

/** Wire the client refresher (the interceptors' single-flight manager) once at boot. */
export function registerSessionRefresher(refresher: SessionRefresher): void {
  sessionRefresher = refresher;
}

/**
 * Refresh `service` through the registered client refresher (the interceptors'
 * single-flight, cross-tab-locked manager), e.g. for the Socket.IO handshake. A
 * refused refresh has then ended the session. Rejects when none is registered.
 */
export function refreshSession(service: ApiService = "MAIN", sentAt?: number): Promise<void> {
  if (!sessionRefresher) return Promise.reject(new Error("No session refresher registered"));
  return sessionRefresher(service, sentAt);
}
