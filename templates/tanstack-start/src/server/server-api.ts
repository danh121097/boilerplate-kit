import { STORAGE_KEYS } from "@/enums";
import { getApiBaseUrl } from "@/services/core/api-config";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { isServerUnauthorized } from "@/services/core/server-auth";
import { getCookie } from "@tanstack/react-start/server";
import type { ServerUnauthorized } from "@/services/core/server-auth";
import type {
  ApiResponse,
  CursorParams,
  CursorResponse,
  PaginatedResponse,
  PaginationParams,
} from "@/services/core/types";

/**
 * Server-side authenticated fetch — SSR counterpart of the browser-only axios
 * client. Forwards the request's access cookie + signs the same HMAC the backend
 * requires, so server functions reuse it instead of re-plumbing cookie/HMAC.
 *
 * `path` is AFTER the API prefix (e.g. "/auth/me") — the value the client signs.
 * Deployment: the SSR server only gets the cookie when it shares a site with the
 * backend (same host in dev; same registrable domain / same-origin proxy in prod).
 *
 * Expired access cookie (it lives 15 min): the server NEVER refreshes. The
 * backend scopes the refresh cookie to `${apiPrefix}/auth`, so page / server-fn
 * requests do not carry it, and a server-side rotation would have to be shared
 * across concurrent reads — weakening the backend's reuse detection. The read
 * returns `ServerUnauthorized` instead and the browser refreshes + replays via
 * `withSessionRefresh`. Never resolves an auth failure to a cacheable empty
 * value; other failures throw.
 */
const API_BASE = getApiBaseUrl();

function hmacHeaders(method: string, path: string, contentType: string): Record<string, string> {
  const sig = HMACSignatureGenerator.signRequest({ method, path, contentType });
  if (!sig) return {};
  const headers: Record<string, string> = { sig: sig.sig, ctime: String(sig.ctime) };
  if (sig["x-version"]) headers["x-version"] = sig["x-version"];
  return headers;
}

/**
 * Authenticated SSR GET core — returns the parsed body (full envelope), or
 * `ServerUnauthorized` when the access cookie is missing or rejected. The HMAC signs the path only; `query` is appended as `?key=value`.
 */
async function authedFetch<R>(
  path: string,
  query?: Record<string, string | number>,
): Promise<R | ServerUnauthorized> {
  const access = getCookie("accessToken");
  const unauthorized: ServerUnauthorized = {
    unauthorized: true,
    hasSession: getCookie(STORAGE_KEYS.SESSION) === "1",
  };
  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`
    : "";
  if (!access) return unauthorized;

  const res = await fetch(`${API_BASE}${path}${qs}`, {
    headers: { cookie: `accessToken=${access}`, ...hmacHeaders("GET", path, "") },
  });
  if (res.status === 401) return unauthorized;
  if (!res.ok) throw new Error(`GET ${path} failed with status ${res.status}`);
  return (await res.json()) as R;
}

/** Single resource — unwraps the envelope's `data`. */
export async function serverApiGet<T>(path: string): Promise<T | ServerUnauthorized> {
  const body = await authedFetch<ApiResponse<T>>(path);
  return isServerUnauthorized(body) ? body : body.data;
}

/**
 * Paginated list — returns the FULL `{ status, data, meta }` envelope (keeps the
 * offset pagination metadata, unlike `serverApiGet` which unwraps `data`).
 */
export function serverApiPaginate<T>(
  path: string,
  params?: PaginationParams,
): Promise<PaginatedResponse<T> | ServerUnauthorized> {
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
): Promise<CursorResponse<T> | ServerUnauthorized> {
  return authedFetch<CursorResponse<T>>(
    path,
    params as Record<string, string | number> | undefined,
  );
}
