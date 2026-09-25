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
  }
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
