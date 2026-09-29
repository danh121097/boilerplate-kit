import type { QueryKey, UseQueryOptions } from "@tanstack/vue-query";
import type { AxiosAdapter, AxiosInstance, AxiosRequestConfig } from "axios";

/**
 * Logical name of a backend an Api instance talks to. "MAIN" is the default and
 * the only service most apps need. The `(string & {})` arm keeps "MAIN"
 * autocompleting while letting apps register extra services freely (see
 * `Api.setBaseURL`).
 */
export type ApiService = "MAIN" | (string & {});

declare module "axios" {
  interface InternalAxiosRequestConfig {
    serviceType?: ApiService;
    /** Set once a request has already been replayed after a token refresh, so a
     * second 401 cannot trigger an endless refresh/retry loop. */
    _retry?: boolean;
    /** When the request was first sent — lets a 401 skip the refresh if another
     * tab (or an earlier refresh) already rotated the auth cookies since then. */
    _sentAt?: number;
  }
}

/** A rotated token pair — token templates only; here the backend rotates the
 * httpOnly cookies and the refresher resolves with no value. Kept so the core
 * type surface matches across templates. */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Resolved refresh config for one service. Both tokens live in httpOnly cookies
 * owned by the backend — nothing is managed client-side.
 */
export interface RefreshOptions {
  /** Refresh endpoint, relative to the owning service's baseURL. */
  endpoint: string;
  /** Which backend owns the refresh cookie. */
  service: ApiService;
  /**
   * Credential endpoints (login, register, logout, ...) whose 401 means "bad
   * credentials", never "expired session" — they are never refreshed or retried.
   * The refresh endpoint itself is always skipped.
   */
  skipPaths: string[];
  /**
   * Whether a session is believed to exist (the readable session hint cookie).
   * When false a 401 is treated as anonymous: no refresh attempt. UX only —
   * never an authorization decision. Defaults to `hasSessionHint`.
   */
  hasSession: () => boolean;
  /** Fired after every successful refresh (renews the session hint). */
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
  /** Set on transient failures (offline, timeout, 429, 5xx): the session is
   * kept and the call may succeed if retried. */
  retryable?: boolean;
  data?: Record<string, unknown>;
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

export type QueryOptions<
  TQueryFnData = unknown,
  TError = ApiResponseError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = UseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>;

export interface HttpInterceptorSetup {
  setupRequestInterceptor: (instance: AxiosInstance, service: ApiService) => void;
  setupResponseInterceptor: (instance: AxiosInstance) => void;
}
