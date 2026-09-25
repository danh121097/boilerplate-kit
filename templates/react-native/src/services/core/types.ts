import type { QueryKey, UseQueryOptions } from "@tanstack/react-query";
import type { AxiosInstance, AxiosRequestConfig } from "axios";

/**
 * Logical name of a backend an Api instance talks to. "MAIN" is the default and
 * the only service most apps need. The `(string & {})` arm keeps "MAIN"
 * autocompleting while letting apps register extra services freely (see
 * `Api.setBaseURL` + `registerServiceToken`).
 */
export type ApiService = "MAIN" | (string & {});

declare module "axios" {
  interface AxiosRequestConfig {
    /** Credential endpoints (login, register, logout): a 401 is passed through
     * as-is — never refreshed, never clears tokens or fires session-expired. */
    skipAuthRefresh?: boolean;
  }
  interface InternalAxiosRequestConfig {
    serviceType?: ApiService;
    /** Set once a request has already been replayed after a token refresh, so a
     * second 401 cannot trigger an endless refresh/retry loop. */
    _retry?: boolean;
    /** Session epoch when the request was sent; a 401 that arrives after the
     * session was cleared is reported as ended, not refreshed. */
    _sessionEpoch?: number;
  }
}

/**
 * Called when a service's session is unrecoverable (a 401 that cannot be
 * refreshed, or the refresh endpoint rejecting with 401/403 — NOT a transient
 * refresh failure such as offline, timeout, 429 or 5xx). On web the app reloaded the page;
 * on React Native there is no `window`, so the app injects a callback that clears
 * auth state and navigates back to `/login`. Defaults to a no-op.
 */
export type SessionExpiredHandler = (service: ApiService) => void;

/**
 * Resolved refresh config for one service. The refresh token is read from
 * SecureStore and sent in the refresh request body; the backend rotates the pair.
 */
export interface RefreshOptions {
  /** Refresh endpoint, relative to the owning service's baseURL. */
  endpoint: string;
  /** Which backend owns the refresh flow. */
  service: ApiService;
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
