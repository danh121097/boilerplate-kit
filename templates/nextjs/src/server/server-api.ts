import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { cookies } from "next/headers";
import type { ApiResponse } from "@/services/core/types";

/**
 * Server-side authenticated fetch — SSR counterpart of the browser-only axios
 * client. Forwards the request's auth cookies + signs the same HMAC the backend
 * requires, so RSC data functions reuse it instead of re-plumbing cookie/HMAC.
 *
 * `path` is AFTER the API prefix (e.g. "/auth/me") — the value the client signs.
 * Deployment: the SSR server only gets the cookie when it shares a site with the
 * backend (same host in dev; same-origin proxy in prod).
 *
 * Next 15: cookies() is async — must be awaited before reading values.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Rebuild a Cookie header from ONLY the auth cookies (never the whole jar). */
async function authCookieHeader(): Promise<string> {
  const store = await cookies();
  const access = store.get("accessToken")?.value;
  const refresh = store.get("refreshToken")?.value;
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
 * Never throws — returns null as the sentinel for "no session / fetch failed".
 */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  try {
    const cookie = await authCookieHeader();
    if (!cookie) return null; // no session → skip the round-trip

    const res = await fetch(`${API_BASE}${path}`, {
      headers: { cookie, ...hmacHeaders("GET", path, "") },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body: ApiResponse<T> = await res.json();
    return body?.data ?? null;
  } catch {
    return null;
  }
}
