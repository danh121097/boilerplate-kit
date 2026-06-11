import { getApiBaseUrl } from "./api-config";
import { HMACSignatureGenerator } from "./hmac-signature";
import type {
  ApiResponse,
  CursorParams,
  CursorResponse,
  PaginatedResponse,
  PaginationParams,
} from "./types";

/**
 * Authenticated GET helpers for the backend (express) — a SEPARATE service, so
 * these call it DIRECTLY (no in-app proxy). They sign the HMAC the backend requires
 * and run isomorphically (SSR + client). On the CLIENT, `credentials: "include"`
 * attaches the httpOnly cookie (same-site); during SSR the browser cookie isn't
 * auto-sent, so it is forwarded from the incoming request headers.
 *
 * `path` is AFTER the API prefix — the contract path (e.g. "/auth/me"). The base
 * (`getApiBaseUrl()` = appEndpoint + "/api/v1") carries the prefix and the backend's
 * HMAC verify strips it, so the signed path matches. Mirrors `serverApiGet` in
 * next/tanstack.
 */
async function authedFetch<R>(
  path: string,
  query?: Record<string, string | number>,
): Promise<R | null> {
  const apiBase = getApiBaseUrl();
  const headers: Record<string, string> = {};

  const sig = HMACSignatureGenerator.signRequest({ method: "GET", path, contentType: "" });
  if (sig) {
    headers.sig = sig.sig;
    headers.ctime = String(sig.ctime);
    if (sig["x-version"]) headers["x-version"] = String(sig["x-version"]);
  }

  if (import.meta.server) {
    const cookie = useRequestHeaders(["cookie"]).cookie;
    if (cookie) headers.cookie = cookie;
  }

  try {
    return await $fetch<R>(`${apiBase}${path}`, { headers, credentials: "include", query });
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
 * pagination metadata, unlike `serverApiGet` which unwraps `data`). Returns null on
 * failure. `params` become the `?page&limit` query string.
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
 * endpoints; returns the FULL `{ status, data, meta }` envelope with cursor `meta`
 * (`nextCursor`, `hasNext`). Returns null on failure.
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
