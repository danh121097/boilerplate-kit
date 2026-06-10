import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { getCookie } from "@tanstack/react-start/server";
import type { ApiResponse } from "@/services/core/types";

/**
 * Server-side authenticated fetch — SSR counterpart of the browser-only axios
 * client. Forwards the request's auth cookies + signs the same HMAC the backend
 * requires, so server functions reuse it instead of re-plumbing cookie/HMAC.
 *
 * `path` is AFTER the API prefix (e.g. "/auth/me") — the value the client signs.
 * Deployment: the SSR server only gets the cookie when it shares a site with the
 * backend (same host in dev; same registrable domain / same-origin proxy in prod).
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Rebuild a Cookie header from ONLY the auth cookies (never the whole jar). */
function authCookieHeader(): string {
  const access = getCookie("accessToken");
  const refresh = getCookie("refreshToken");
  return [access && `accessToken=${access}`, refresh && `refreshToken=${refresh}`]
    .filter(Boolean)
    .join("; ");
}

function hmacHeaders(method: string, path: string, contentType: string): Record<string, string> {
  const sig = HMACSignatureGenerator.signRequest({ method, path, contentType });
  if (!sig) return {};
  const headers: Record<string, string> = { sig: sig.sig, ctime: String(sig.ctime) };
  if (sig["x-version"]) headers["x-version"] = sig["x-version"];
  return headers;
}

/**
 * Authenticated SSR GET. Unwraps the backend envelope and returns its `data` as
 * `T`, or null if unauthenticated / failed — so callers pass the inner payload
 * type (e.g. `User[]`, `{ user }`), not the whole `{ status, data }` wrapper.
 */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  const cookie = authCookieHeader();
  if (!cookie) return null; // no session → skip the round-trip

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { cookie, ...hmacHeaders("GET", path, "") },
  });
  if (!res.ok) return null;
  const body: ApiResponse<T> = await res.json();
  return body?.data ?? null;
}
