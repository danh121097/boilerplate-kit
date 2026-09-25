import { getApiBaseUrl } from "@/services/core/api-config";
import { getAppPrefix } from "@/services/core/app-prefix";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type {
  ApiResponse,
  ApiResponseError,
  CursorParams,
  CursorResponse,
  PaginatedResponse,
  PaginationParams,
} from "@/services/core/types";

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
 *
 * These helpers never refresh: the refresh cookie is scoped to the backend's
 * auth routes and only the browser can rotate it. They are meant for SSR — the
 * browser reads the same endpoints through the axios Models, whose interceptors
 * refresh-and-retry on 401 (see `useMeQuery` / `useUsersListQuery`).
 * Failures REJECT with an `ApiResponseError` (`error_code` = HTTP status, 0 when
 * the backend is unreachable; `retryable` on 0/408/429/5xx) so the query sees
 * them instead of a silent null.
 */
function toServerApiError(error: unknown): ApiResponseError {
  const e = error as { data?: unknown; statusCode?: number; message?: string } | null;
  const data =
    e?.data && typeof e.data === "object" ? (e.data as Partial<ApiResponseError>) : undefined;
  const message = data?.message ?? e?.message ?? "request_failed";
  const status = e?.statusCode;
  const transient = !status || status === 408 || status === 429 || status >= 500;
  return {
    ...data,
    status: data?.status ?? "error",
    message,
    error_message: data?.error_message ?? message,
    error_code: data?.error_code ?? status ?? 0,
    ...(transient ? { retryable: true } : {}),
  };
}

/** The value of cookie `name` in a `Cookie` header (undefined when absent). */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * SSR: the incoming request carries the `${APP_PREFIX}_SESSION` hint cookie.
 * Only valid inside a Nuxt request context (call it before any `await`); false
 * outside one.
 */
export function hasServerSessionHint(): boolean {
  try {
    const cookie = useRequestHeaders(["cookie"]).cookie;
    return readCookie(cookie, `${getAppPrefix()}_SESSION`) === "1";
  } catch {
    return false;
  }
}

async function authedFetch<R>(path: string, query?: Record<string, string | number>): Promise<R> {
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
  } catch (error) {
    throw toServerApiError(error);
  }
}

/** Single resource — unwraps the envelope's `data` (null when the body has none).
 * Rejects with an `ApiResponseError` on failure. */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  const body = await authedFetch<ApiResponse<T>>(path);
  return body?.data ?? null;
}

/**
 * Paginated list — returns the FULL `{ status, data, meta }` envelope (keeps the
 * pagination metadata, unlike `serverApiGet` which unwraps `data`). Rejects with an
 * `ApiResponseError` on failure. `params` become the `?page&limit` query string.
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
 * endpoints; returns the FULL `{ status, data, meta }` envelope with cursor `meta`
 * (`nextCursor`, `hasNext`). Rejects with an `ApiResponseError` on failure.
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
