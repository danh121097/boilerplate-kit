import { MOCK_ACCESS_TOKEN } from "@/services/auth/data/mock-auth-session";
import { AxiosError } from "axios";
import type { AuthUser } from "@/services/auth/types/auth";
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

export const authResult = (user: AuthUser) => ({
  user,
  tokens: { accessToken: MOCK_ACCESS_TOKEN },
});

/** The backend's error envelope (see its error handler): `errorType` names the class of failure. */
export const failure = (status: number, errorType: string, message: string) => ({
  success: false,
  status: "error",
  errorType,
  message,
  error_code: status,
  error_message: message,
});

export const unauthorized = (message: string) => failure(401, "AUTHENTICATION_ERROR", message);

export function bodyOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.data;
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Request path without query or hash; the refresh call passes an absolute URL, so callers match by suffix. */
export function pathOf(config: InternalAxiosRequestConfig): string {
  return (config.url ?? "").split(/[?#]/)[0] ?? "";
}

/** Query values of a request: those already in the URL, then `params`. */
export function queryOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const search = (config.url ?? "").split("#")[0]?.split("?")[1] ?? "";
  const params: unknown = config.params;
  return {
    ...Object.fromEntries(new URLSearchParams(search)),
    ...(params && typeof params === "object" ? params : {}),
  };
}
