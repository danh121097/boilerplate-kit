import type { QueryKey, UseQueryOptions } from "@tanstack/react-query";
import type { AxiosAdapter, AxiosInstance, AxiosRequestConfig } from "axios";

/**
 * Logical name of a backend an Api instance talks to. "MAIN" is the default and
 * the only service most apps need. The `(string & {})` arm keeps "MAIN"
 * autocompleting while letting apps register extra services freely (see
 * `Api.setBaseURL` + `registerServiceToken`).
 */
export type ApiService = "MAIN" | (string & {});

declare module "axios" {
  interface InternalAxiosRequestConfig {
    serviceType?: ApiService;
    /** Set once a request has already been replayed after a token refresh, so a
     * second 401 cannot trigger an endless refresh/retry loop. */
    _retry?: boolean;
  }
}

/** Tokens a refresh returned. The refresh manager persists them — only while
 * the session that asked is still current (logout may have run meanwhile). */
export interface RefreshedTokens {
  accessToken: string;
  /** The rotated refresh token, when the backend returns one in the body. */
  refreshToken?: string;
}

/**
 * Resolved refresh config for one service. Both tokens live in localStorage
 * (see `auth-token-storage`); the refresh token is sent in the refresh body.
 */
export interface RefreshOptions {
  /** Refresh endpoint, relative to the owning service's baseURL. */
  endpoint: string;
  /** Which backend owns the tokens. */
  service: ApiService;
  /** Credential endpoints (login/register/logout) whose 401 is final — a wrong
   * password must surface as an error, never trigger a refresh. */
  skipPaths: string[];
  /** Whether a session exists worth refreshing (default: the service holds an
   * access or refresh token). Anonymous 401s pass through untouched; also
   * re-checked once the refresh lock is held (another tab may have logged out). */
  hasSession: () => boolean;
  /** Called after a refresh stored a rotated pair. */
  onRefreshed?: () => void;
}

/**
 * Per-service refresh config as supplied at registration. Presence (a service
 * appearing in the registration map) is what enables refresh for that service;
 * `service` is implied by the map key, so it is omitted here.
 */
export type ServiceRefreshConfig = Partial<Omit<RefreshOptions, "service">>;

export interface ApiResponse<T = unknown> {
  status: string;
  data: T;
  message?: string;
  error_code?: number;
}

/** Offset pagination metadata — mirrors the express `OffsetMeta`. */
export interface OffsetMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Cursor (keyset) pagination metadata — mirrors the express `CursorMeta`. */
export interface CursorMeta {
  limit: number;
  nextCursor: string | null;
  hasNext: boolean;
}

/** List envelope with offset `meta` — matches the express `{ status, data, meta }`. */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: OffsetMeta;
}

/** Cursor list envelope: `ApiResponse` with a list `data` + cursor `meta`. */
export interface CursorResponse<T> extends ApiResponse<T[]> {
  meta: CursorMeta;
}

/** Query params for offset pagination (`?page&limit`). */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Query params for cursor pagination (`?cursor&limit`). */
export interface CursorParams {
  cursor?: string;
  limit?: number;
}

export interface ApiResponseError {
  status: string;
  message: string;
  error_code: number;
  error_message: string;
  data?: Record<string, unknown>;
  /** Set when a request failed only because the token refresh was temporarily
   * unavailable (network / timeout / 5xx / 429) — the session is intact, retry later. */
  retryable?: boolean;
}

export interface HMACSignatureData {
  sig: string;
  ctime: number;
  "x-version"?: string;
  [extra: string]: string | number | undefined;
}

export interface ServiceConfig {
  path: string;
  service?: ApiService;
  baseURL?: string;
  /** Replaces axios's network adapter for this service's client (dev-only mock auth). */
  adapter?: AxiosAdapter;
}

export interface ApiRequestConfig extends AxiosRequestConfig {
  customHeaders?: Record<string, string>;
}

// React Query v5 UseQueryOptions has 4 type params (no separate TQueryData arg)
export type QueryOptions<
  TQueryFnData = unknown,
  TError = ApiResponseError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>;

export interface HttpInterceptorSetup {
  setupRequestInterceptor: (instance: AxiosInstance, service: ApiService) => void;
  setupResponseInterceptor: (instance: AxiosInstance) => void;
}
