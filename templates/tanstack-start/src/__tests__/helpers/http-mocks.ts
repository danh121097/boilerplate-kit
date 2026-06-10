import { ApiInterceptors } from "@/services/core";
import type { ServiceRefreshConfig } from "@/services/core";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import axios from "axios";

/** Build an axios instance wired with the real request + response interceptors. */
export function makeClient(
  adapter: AxiosAdapter,
  refresh: Record<string, ServiceRefreshConfig> = { MAIN: { endpoint: "/auth/refresh" } },
) {
  const instance = axios.create({ adapter });
  const interceptors = new ApiInterceptors(refresh);
  interceptors.setupRequestInterceptor(instance, "MAIN");
  interceptors.setupResponseInterceptor(instance);
  return instance;
}

/** A 200 response carrying `data` (mirrors a backend success envelope when wrapped). */
export function ok(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { data, status: 200, statusText: "OK", headers: {}, config } as AxiosResponse;
}

/** A rejected request shaped like an AxiosError with a `response.status`. */
export function httpError(
  config: InternalAxiosRequestConfig,
  status = 401,
  data: unknown = { success: false, message: "expired" },
): Promise<never> {
  const err = new Error(`Request failed with status code ${status}`) as Error & {
    response?: unknown;
    config?: unknown;
    isAxiosError?: boolean;
  };
  err.isAxiosError = true;
  err.config = config;
  err.response = { status, data, headers: {}, config };
  return Promise.reject(err);
}
