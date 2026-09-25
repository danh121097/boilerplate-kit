import { getAppPrefix } from "@/services/core/app-prefix";
import { hasServerSessionHint } from "@/services/core/server-api";
import type { ApiService } from "@/services/core/types";

/**
 * Client session plumbing shared by the interceptors, the auth model, the
 * plugins and the login page.
 *
 * Session epoch — a per-service counter bumped whenever that service's session
 * ends (logout, refused refresh). A refresh captures it before its network call
 * and discards its result when it moved meanwhile, so a refresh still in flight
 * at logout cannot re-mark the session active. While a logout runs
 * (`beginLogout`), no refresh may start at all.
 *
 * Session hint — a readable (non-httpOnly) `${APP_PREFIX}_SESSION=1` cookie. The
 * auth tokens are httpOnly, so JS cannot tell an anonymous visitor from a
 * signed-in user whose access cookie just expired. The hint is set on login /
 * register / refresh and cleared when the session ends. It only drives UX (no
 * hint → a 401 is anonymous: no refresh, no redirect); it carries no secret and
 * is never trusted for authorization. Its lifetime mirrors the 7-day refresh
 * cookie.
 *
 * Session end — logout and a refused refresh both end a service's session;
 * listeners (query cache, router) filter on the service and react. The service
 * layer never reloads the page or touches the router.
 *
 * Cross-tab sync — login / session end write `${APP_PREFIX}_AUTH_SYNC` to
 * localStorage, which reaches the other tabs as a `storage` event (see
 * `syncAuthAcrossTabs`).
 */

const sessionEpochs = new Map<string, number>();

export function getSessionEpoch(service: ApiService = "MAIN"): number {
  return sessionEpochs.get(service) ?? 0;
}

/** Invalidate every refresh of `service` started before now: one still in flight marks nothing. */
export function bumpSessionEpoch(service: ApiService = "MAIN"): void {
  sessionEpochs.set(service, getSessionEpoch(service) + 1);
}

/** Per-service count of running logouts — no new refresh may start meanwhile. */
const pendingLogouts = new Map<string, number>();

/** A logout is running for `service`: every new refresh — and every 401 that
 * would trigger one — rejects with `session_ended`. */
export function isLogoutPending(service: ApiService = "MAIN"): boolean {
  return (pendingLogouts.get(service) ?? 0) > 0;
}

/**
 * Mark a logout as running until the returned `done()` is called (idempotent).
 * Call synchronously when logout starts, before any await; logout then bumps
 * the epoch right before its request.
 */
export function beginLogout(service: ApiService = "MAIN"): () => void {
  pendingLogouts.set(service, (pendingLogouts.get(service) ?? 0) + 1);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pendingLogouts.set(service, (pendingLogouts.get(service) ?? 1) - 1);
  };
}

const SESSION_HINT_MAX_AGE = 7 * 24 * 60 * 60;

/** `${APP_PREFIX}_SESSION` — matches `useStorageKeys("SESSION")`. */
const hintCookieName = () => `${getAppPrefix()}_SESSION`;
/** `${APP_PREFIX}_AUTH_SYNC` — matches `useStorageKeys("AUTH_SYNC")`. */
const authSyncKey = () => `${getAppPrefix()}_AUTH_SYNC`;

/** Hint presence as this tab last wrote or observed it (null until first read). */
let knownHint: boolean | null = null;

/**
 * True when the hint cookie is present. In the browser it reads
 * `document.cookie`; during SSR the incoming request's cookie header (call it
 * synchronously inside a Nuxt context — before any `await`).
 */
export function hasSessionHint(): boolean {
  if (typeof document === "undefined") return hasServerSessionHint();
  const name = hintCookieName();
  return document.cookie.split(";").some((part) => part.trim() === `${name}=1`);
}

/** Mark (or renew) the hint after a successful login / register / refresh. */
export function markSessionActive(): void {
  if (typeof document === "undefined") return;
  knownHint = true;
  document.cookie = `${hintCookieName()}=1; path=/; max-age=${SESSION_HINT_MAX_AGE}; SameSite=Lax`;
}

/** Drop the hint. The epoch is not touched — `endSession` owns that. */
export function clearSessionHint(): void {
  if (typeof document === "undefined") return;
  knownHint = false;
  document.cookie = `${hintCookieName()}=; path=/; max-age=0; SameSite=Lax`;
}

type AuthSyncEvent = "login" | "logout";

/** Tell the other tabs; a fresh timestamp makes every write a `storage` event. */
function broadcast(type: AuthSyncEvent): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(authSyncKey(), JSON.stringify({ type, at: Date.now() }));
  } catch {
    // Storage blocked (private mode, quota): the other tabs catch up on focus.
  }
}

/** A login / register succeeded: mark the session and tell the other tabs. */
export function startSession(): void {
  markSessionActive();
  broadcast("login");
}

export type SessionEndReason = "logout" | "expired";
type SessionEndListener = (reason: SessionEndReason, service: ApiService) => void;

const listeners = new Set<SessionEndListener>();

/** Subscribe to session end (logout / refused refresh); returns the unsubscribe. */
export function onSessionEnded(listener: SessionEndListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Bump the epoch and notify listeners — no hint change, no broadcast. */
function notifySessionEnded(reason: SessionEndReason, service: ApiService): void {
  bumpSessionEpoch(service);
  for (const listener of listeners) listener(reason, service);
}

/**
 * End `service`'s session in this tab: bump its epoch; for the main session
 * also drop the hint and tell the other tabs; then notify listeners.
 */
export function endSession(reason: SessionEndReason, service: ApiService = "MAIN"): void {
  if (service === "MAIN") {
    clearSessionHint();
    broadcast("logout");
  }
  notifySessionEnded(reason, service);
}

export interface AuthSyncHandlers {
  /** Another tab signed in — re-read the session. */
  onLogin?: () => void;
  /** Another tab signed out (session-end listeners have already run). */
  onLogout?: () => void;
}

/**
 * Keep this tab in step with logins / logouts made in other tabs: the
 * `AUTH_SYNC` storage event, plus a hint re-read on focus / visibility (the
 * hint is a cookie, so its expiry emits no event). A remote logout ends the
 * local session ("logout") without touching the hint cookie or re-broadcasting,
 * then calls `onLogout`; a remote login calls `onLogin`. Browser-only; returns the unsubscribe.
 */
export function syncAuthAcrossTabs(handlers: AuthSyncHandlers = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  knownHint = hasSessionHint();

  const signedIn = () => {
    knownHint = true;
    handlers.onLogin?.();
  };
  // Another tab ended the session: reset this tab only. The hint cookie is
  // shared and already handled by that tab — never touched or re-broadcast
  // here. Repeated signals for the same logout (broadcast, then focus) end it
  // once.
  const signedOut = () => {
    if (knownHint === false) return;
    knownHint = false;
    notifySessionEnded("logout", "MAIN");
    handlers.onLogout?.();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== authSyncKey() || !event.newValue) return;
    let type: unknown;
    try {
      type = (JSON.parse(event.newValue) as { type?: unknown }).type;
    } catch {
      return;
    }
    if (type === "login") signedIn();
    else if (type === "logout") signedOut();
  };
  const recheck = () => {
    if (document.visibilityState === "hidden") return;
    const present = hasSessionHint();
    if (present === knownHint) return;
    if (present) signedIn();
    else signedOut();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", recheck);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", recheck);
    document.removeEventListener("visibilitychange", recheck);
  };
}

/**
 * Call `redirect` when `service`'s live session expires (the backend refused
 * the refresh). Logout is not a trigger — the caller navigates itself. Returns
 * the unsubscribe. Pair with `loginPathWithReturn` so the user lands back on
 * the page they were on.
 */
export function redirectOnSessionExpired(
  redirect: () => void,
  service: ApiService = "MAIN",
): () => void {
  return onSessionEnded((reason, ended) => {
    if (reason === "expired" && ended === service) redirect();
  });
}

/** `/login?redirect=<current path>` — the path the login page returns to. */
export function loginPathWithReturn(currentPath: string): string {
  return `/login?redirect=${encodeURIComponent(currentPath)}`;
}

/** Longest `redirect` value accepted as a return path. */
const MAX_REDIRECT_LENGTH = 512;

/**
 * Same-origin return path from an untrusted `redirect` value, else `fallback`.
 * Accepted only when ALL hold: a string of at most 512 chars; starts with
 * exactly one "/" ("//host" and "/\host" are protocol-relative to another
 * origin); no "\" and no control character anywhere (the URL parser strips
 * tab/CR/LF, so "/\t/evil.example" would resolve to "//evil.example"); no
 * "://"; and not the login page itself (which would loop).
 */
export function safeRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > MAX_REDIRECT_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex -- matching control chars is the point
  if (value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value)) return fallback;
  if (value.includes("://")) return fallback;
  if (/^\/login\/?(?:[?#]|$)/.test(value)) return fallback;
  return value;
}
