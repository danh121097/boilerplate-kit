import { useAuthStore } from "@/stores/auth";
import { useEffect } from "react";
import { AppState } from "react-native";

/** Shortest time between two session checks triggered by returning to the foreground. */
export const SESSION_REVALIDATE_INTERVAL_MS = 30_000;

/**
 * Re-check the session when the app returns from the background, so an account
 * deleted or revoked meanwhile signs out on resume instead of at the next
 * request. The check is the auth store's session query (`/auth/me`, through the
 * interceptors and their single-flight refresh), skipped while signed out or
 * not yet hydrated and when the last check — mount counts, the boot restore just
 * ran — is under `minIntervalMs` old. It is silent: an offline or failing
 * server changes nothing; only a refused session signs out.
 */
export function useSessionRevalidation(minIntervalMs = SESSION_REVALIDATE_INTERVAL_MS): void {
  useEffect(() => {
    let lastCheck = Date.now();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const { isAuthenticated, hydrated, loadUser } = useAuthStore.getState();
      if (!hydrated || !isAuthenticated) return;
      const now = Date.now();
      if (now - lastCheck < minIntervalMs) return;
      lastCheck = now;
      void loadUser({ silent: true });
    });
    return () => subscription.remove();
  }, [minIntervalMs]);
}
