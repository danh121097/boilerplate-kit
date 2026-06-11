import { getApiBaseUrl } from "@/services/core/api-config";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { cookies } from "next/headers";
import type {
  ApiResponse,
  CursorParams,
  CursorResponse,
  PaginatedResponse,
  PaginationParams,
} from "@/services/core/types";

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
const API_BASE = getApiBaseUrl();

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
 * Authenticated SSR GET core — forwards the auth cookies + HMAC and returns the
 * parsed body (full envelope), or null when unauthenticated / failed. The HMAC
 * signs the path only; `query` is appended as the `?key=value` string. Never
 * throws — null is the sentinel for "no session / fetch failed".
 */
async function authedFetch<R>(
  path: string,
  query?: Record<string, string | number>,
): Promise<R | null> {
  try {
    const cookie = await authCookieHeader();
    if (!cookie) return null; // no session → skip the round-trip

    const qs = query
      ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`
      : "";
    const res = await fetch(`${API_BASE}${path}${qs}`, {
      headers: { cookie, ...hmacHeaders("GET", path, "") },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as R;
  } catch {
    return null;
  }
}

/** Single resource — unwraps the envelope's `data`. Returns null on failure. */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  const body = await authedFetch<ApiResponse<T>>(path);
  return body?.data ?? null;
}

/**
 * Paginated list — returns the FULL `{ status, data, meta }` envelope (keeps the
 * offset pagination metadata, unlike `serverApiGet` which unwraps `data`).
 */
export function serverApiPaginate<T>(
  path: string,
  params?: PaginationParams,
): Promise<PaginatedResponse<T> | null> {
  return authedFetch<PaginatedResponse<T>>(
    path,
    params as Record<string, string | number> | undefined,
  );
}

/**
 * Cursor (keyset) paginated list — like `serverApiPaginate` but for `?cursor&limit`
 * endpoints; returns the full envelope with cursor `meta` (`nextCursor`, `hasNext`).
 */
export function serverApiCursorPaginate<T>(
  path: string,
  params?: CursorParams,
): Promise<CursorResponse<T> | null> {
  return authedFetch<CursorResponse<T>>(
    path,
    params as Record<string, string | number> | undefined,
  );
}
