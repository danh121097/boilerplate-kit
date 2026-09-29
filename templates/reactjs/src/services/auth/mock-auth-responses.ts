import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

// Dev-only mock auth: backend-shaped replies and request parsing (see `mock-auth.ts`).
// Backend-shaped responses (see the express auth controller / error handler).

export function reply(
  config: InternalAxiosRequestConfig,
  status: number,
  body: Record<string, unknown>,
): Promise<AxiosResponse> {
  const response = { data: body, status, statusText: "", headers: {}, config, request: {} };
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(
    new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      response.request,
      response,
    ),
  );
}

export const succeed = (message: string, data?: unknown) => ({
  success: true,
  message,
  ...(data === undefined ? {} : { data }),
});

export const unauthorized = (message: string) => ({
  success: false,
  status: "error",
  errorType: "AUTHENTICATION_ERROR",
  message,
  error_code: 401,
  error_message: message,
});

export function bodyOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.data;
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function bearerOf(config: InternalAxiosRequestConfig): string | null {
  const raw = AxiosHeaders.from(config.headers).get("authorization");
  return typeof raw === "string" && raw.startsWith("Bearer ") ? raw.slice(7) : null;
}

/** Request path without query or hash; the refresh call passes an absolute URL, so callers match by suffix. */
export function pathOf(config: InternalAxiosRequestConfig): string {
  return (config.url ?? "").split(/[?#]/)[0] ?? "";
}
