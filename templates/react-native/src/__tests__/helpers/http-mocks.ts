import { ApiInterceptors } from "@/services/core";
import axios, { AxiosError, AxiosHeaders } from "axios";
import type { ServiceRefreshConfig } from "@/services/core";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

/** The MAIN refresh config the app registers: refresh endpoint + credential paths. */
export const MAIN_REFRESH: Record<string, ServiceRefreshConfig> = {
  MAIN: {
    endpoint: "/auth/refresh",
    skipPaths: ["/auth/login", "/auth/register", "/auth/logout"],
  },
};

/** Build an axios instance wired with the real request + response interceptors. */
export function makeClient(
  adapter: AxiosAdapter,
  refresh: Record<string, ServiceRefreshConfig> = MAIN_REFRESH,
  service = "MAIN",
) {
  const interceptors = new ApiInterceptors(refresh);
  const instance = axios.create({ adapter });
  interceptors.setupRequestInterceptor(instance, service);
  interceptors.setupResponseInterceptor(instance);
  return instance;
}

/** Extract the bare token from a request's Authorization header. */
export function bearerOf(config: InternalAxiosRequestConfig): string {
  const headers = config.headers as unknown as Record<string, unknown>;
  const raw = String(headers?.authorization ?? headers?.Authorization ?? "");
  return raw.replace("Bearer ", "");
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

/** A failed refresh POST as axios would reject it (no status = offline/timeout). */
export function refreshFailure(code: string, status?: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response =
    status === undefined
      ? undefined
      : ({ status, data: { success: false }, headers: {}, config, statusText: "" } as never);
  return new AxiosError("refresh failed", code, config as never, {}, response);
}
