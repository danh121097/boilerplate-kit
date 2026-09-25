import { STORAGE_KEYS } from "@/enums";
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
 * client. Forwards the request's access cookie + signs the same HMAC the backend
 * requires, so RSC data functions reuse it instead of re-plumbing cookie/HMAC.
 *
 * `path` is AFTER the API prefix (e.g. "/auth/me") — the value the client signs.
 * Deployment: the SSR server only gets the cookie when it shares a site with the
 * backend (same host in dev; same-origin proxy in prod).
 *
 * No server-side refresh, by design: a Server Component cannot set cookies
 * (`cookies().set` only works in Server Actions / Route Handlers), and the
 * backend rotates the refresh token on every refresh — rotating here without
 * handing the new cookies to the browser would leave it holding a revoked token,
 * whose next use trips reuse detection and revokes ALL sessions. (The refresh
 * cookie is also path-scoped to `${apiPrefix}/auth`, so page requests never
 * carry it.) Instead every auth failure THROWS: a throwing prefetch is not
 * dehydrated, so the client query refetches through axios, which refreshes.
 *
 * Next 15+: cookies() is async — must be awaited before reading values.
 */
const API_BASE = getApiBaseUrl();

/** The server could not prove a session (missing/expired access cookie). */
export class ServerAuthError extends Error {
  readonly status = 401;

  constructor(path: string) {
    super(`Unauthorized: GET ${path}`);
    this.name = "ServerAuthError";
  }
}

/** Whether the request carries the readable session hint (see `services/core/session`). */
export async function hasServerSessionHint(): Promise<boolean> {
  return (await cookies()).get(STORAGE_KEYS.SESSION)?.value === "1";
}

function hmacHeaders(method: string, path: string, contentType: string): Record<string, string> {
  const sig = HMACSignatureGenerator.signRequest({ method, path, contentType });
  if (!sig) return {};
  const headers: Record<string, string> = { sig: sig.sig, ctime: String(sig.ctime) };
  if (sig["x-version"]) headers["x-version"] = sig["x-version"];
  return headers;
}

/**
 * Authenticated SSR GET core — forwards the access cookie + HMAC and returns the
 * parsed body (full envelope). The HMAC signs the path only; `query` is appended
 * as the `?key=value` string. Throws `ServerAuthError` on a missing access
 * cookie or a 401, and a plain Error on any other failure — never resolves a
 * failure to a value React Query would cache as success.
 */
async function authedFetch<R>(path: string, query?: Record<string, string | number>): Promise<R> {
  const access = (await cookies()).get("accessToken")?.value;
  if (!access) throw new ServerAuthError(path); // expired (15 min) or anonymous

  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`
    : "";
  const res = await fetch(`${API_BASE}${path}${qs}`, {
    headers: { cookie: `accessToken=${access}`, ...hmacHeaders("GET", path, "") },
    cache: "no-store",
  });
  if (res.status === 401) throw new ServerAuthError(path);
  if (!res.ok) throw new Error(`GET ${path} failed with status ${res.status}`);
  return (await res.json()) as R;
}

/** Single resource — unwraps the envelope's `data`. Throws on failure. */
export async function serverApiGet<T>(path: string): Promise<T> {
  const body = await authedFetch<ApiResponse<T>>(path);
  return body.data;
}

/**
 * Paginated list — returns the FULL `{ status, data, meta }` envelope (keeps the
 * offset pagination metadata, unlike `serverApiGet` which unwraps `data`).
 */
export function serverApiPaginate<T>(
  path: string,
  params?: PaginationParams,
): Promise<PaginatedResponse<T>> {
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
): Promise<CursorResponse<T>> {
  return authedFetch<CursorResponse<T>>(
    path,
    params as Record<string, string | number> | undefined,
  );
}
