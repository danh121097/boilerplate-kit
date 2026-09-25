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

/** Tokens minted by a refresh; the refresh token is present when the backend rotates. */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Resolved refresh config for one service. The refresh token is read from
 * SecureStore and sent in the refresh request body; the backend rotates the pair.
 */
export interface RefreshOptions {
  /** Refresh endpoint, relative to the owning service's baseURL. */
  endpoint: string;
  /** Which backend owns the refresh flow. */
  service: ApiService;
  /** Credential paths (login, register, logout) whose 401 is passed through
   * as-is — never refreshed. Matched on the path without query or hash, exactly
   * or as a suffix. The refresh endpoint is always exempt. */
  skipPaths: string[];
  /** Whether a session exists to refresh. Default: an access or refresh token
   * is stored for the service (`hasStoredSession`). Async on React Native
   * because SecureStore reads are async. */
  hasSession: () => boolean | Promise<boolean>;
  /** Called after a refresh persisted the rotated tokens. */
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

export interface ApiResponseError {
  status: string;
  message: string;
  error_code: number;
  error_message: string;
  /** True for a transient failure (offline, timeout, 408, 429, 5xx, an
   * unavailable refresh): retrying later may succeed and the session is kept. */
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
