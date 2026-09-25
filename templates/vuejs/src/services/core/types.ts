import type { QueryKey, UseQueryOptions } from "@tanstack/vue-query";
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
  }
}

/** A rotated token pair (the refresh token is optional — some backends keep it
 * in an httpOnly cookie). */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Resolved refresh config for one service. Both tokens are kept in that
 * service's localStorage slots (see `auth-token-storage.ts`); the refresh token
 * is sent in the refresh request body.
 */
export interface RefreshOptions {
  /** Refresh endpoint, relative to the owning service's baseURL. */
  endpoint: string;
  /** Which backend issued the tokens. */
  service: ApiService;
  /**
   * Credential endpoints (login, register, logout, ...) whose 401 means "bad
   * credentials", never "expired session" — they are never refreshed or retried.
   * The refresh endpoint itself is always skipped.
   */
  skipPaths: string[];
  /**
   * Whether a session is believed to exist. When false a 401 is anonymous and
   * final: no refresh attempt. Defaults to `hasStoredSession(service)` (an access
   * or refresh token is stored).
   */
  hasSession: () => boolean;
  /** Fired after every successful refresh. */
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
