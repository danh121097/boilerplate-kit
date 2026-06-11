import type { QueryKey, UseQueryOptions } from "@tanstack/vue-query";
import type { AxiosInstance, AxiosRequestConfig } from "axios";

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
  }
}

/**
 * Resolved refresh config for one service. The refresh token itself lives in an
 * httpOnly cookie owned by the backend — only the short-lived access token is
 * managed client-side.
 */
export interface RefreshOptions {
  /** Refresh endpoint, relative to the owning service's baseURL. */
  endpoint: string;
  /** Which backend owns the refresh cookie. */
  service: ApiService;
  /** Reload the page when a refresh ultimately fails (session truly expired). */
  reloadOnFailure: boolean;
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
