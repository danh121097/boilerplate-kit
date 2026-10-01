import { getApiBaseUrl } from "@/services/core/api-config";
import { isHmacError } from "@/services/core/api-errors";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import { cookies } from "next/headers";
import type {
  ApiResponse,
  ApiResponseError,
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
 * carry it.) Instead every failure REJECTS with an `ApiResponseError`
 * (`error_code` = HTTP status — 401 for a missing/expired access cookie — or 0
 * when the backend is unreachable; `retryable` on 0/408/429/5xx): a rejecting
 * prefetch is not dehydrated, so the client query refetches through axios,
 * which refreshes.
 *
 * Dev only, with the mock-auth flag on: the users reads are answered from the
 * mock session cookie instead (`mock-server-read.ts`), through the same error
 * mapping, so a mock failure rejects exactly like a backend one.
 *
 * Next 15+: cookies() is async — must be awaited before reading values.
 */
const API_BASE = getApiBaseUrl();

/** Build the `ApiResponseError` a server read rejects with, from the HTTP
 * status (0 = no response) and the response body when it is an envelope. */
function toServerApiError(status: number, body?: unknown, fallback = "request_failed") {
  const data = body && typeof body === "object" ? (body as Partial<ApiResponseError>) : undefined;
  const message = data?.message ?? fallback;
  const transient = !status || status === 408 || status === 429 || status >= 500;
  const error: ApiResponseError = {
    ...data,
    status: data?.status ?? "error",
    message,
    error_message: data?.error_message ?? message,
    error_code: data?.error_code ?? status,
    // A rejected signature is not a verdict on the session: retryable like a transient failure.
    ...(transient || isHmacError(data) ? { retryable: true } : {}),
  };
  return error;
}

let hmacWarned = false;

/** Log a server-side `HMAC_ERROR` once per process (every read would repeat it). */
function warnHmacRejectedOnce(): void {
  if (hmacWarned) return;
  hmacWarned = true;
  console.warn(
    "[server-api] Backend rejected the request signature (HMAC_ERROR): check the server clock and that NEXT_PUBLIC_HMAC_SECRET matches the backend HMAC_SECRET.",
  );
}

/** Query params as callers pass them; `undefined` / `null` entries are dropped. */
type QueryParams = Record<string, string | number | null | undefined>;

/** The params that carry a value, or undefined when none do (no stray `?page=undefined`). */
function definedParams(query?: QueryParams): Record<string, string | number> | undefined {
  const entries = Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== null);
  return entries.length
    ? (Object.fromEntries(entries) as Record<string, string | number>)
    : undefined;
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
 * as the `?key=value` string. Rejects with an `ApiResponseError` — 401 on a
 * missing access cookie — never resolving a failure to a value React Query
 * would cache as success.
 */
async function authedFetch<R>(path: string, params?: QueryParams): Promise<R> {
  const query = definedParams(params);
  // Dev-only mock auth answers the reads it owns from the mock cookie. The
  // constant makes this branch (and the dynamic import) vanish in production.
  if (process.env.NODE_ENV !== "production") {
    const { answerMockServerRead } = await import("@/server/mock-server-read");
    const mocked = await answerMockServerRead(path, query);
    if (mocked) {
      if (mocked.status === 200) return mocked.body as R;
      throw toServerApiError(mocked.status, mocked.body);
    }
  }

  const access = (await cookies()).get("accessToken")?.value;
  // Expired (15 min) or anonymous: nothing to prove a session with.
  if (!access) throw toServerApiError(401, undefined, "Unauthorized");

  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`
    : "";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs}`, {
      headers: { cookie: `accessToken=${access}`, ...hmacHeaders("GET", path, "") },
      cache: "no-store",
    });
  } catch (error) {
    throw toServerApiError(0, undefined, error instanceof Error ? error.message : undefined);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    // A rejected signature (clock skew / secret mismatch) is not an expired session:
    // the rejection keeps its `errorType`, so it is never read as a signed-out 401.
    if (res.status === 401 && isHmacError(body)) warnHmacRejectedOnce();
    throw toServerApiError(res.status, body, `GET ${path} failed with status ${res.status}`);
  }
  return (await res.json()) as R;
}

/** Single resource — unwraps the envelope's `data`. Rejects on failure. */
export async function serverApiGet<T>(path: string): Promise<T> {
  const body = await authedFetch<ApiResponse<T>>(path);
  return body.data;
}

/**
 * Paginated list — returns the FULL `{ success, data, meta }` envelope (keeps the
 * offset pagination metadata, unlike `serverApiGet` which unwraps `data`).
 */
export function serverApiPaginate<T>(
  path: string,
  params?: PaginationParams,
): Promise<PaginatedResponse<T>> {
  return authedFetch<PaginatedResponse<T>>(path, params as QueryParams | undefined);
}

/**
 * Cursor (keyset) paginated list — like `serverApiPaginate` but for `?cursor&limit`
 * endpoints; returns the full envelope with cursor `meta` (`nextCursor`, `hasNext`).
 */
export function serverApiCursorPaginate<T>(
  path: string,
  params?: CursorParams,
): Promise<CursorResponse<T>> {
  return authedFetch<CursorResponse<T>>(path, params as QueryParams | undefined);
}
