import {
  isHmacError,
  isRefreshRefused,
  refreshHmacRejected,
  refreshUnavailable,
  SessionEndedError,
  toApiError,
} from "@/services/core/api-errors";
import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { HeadersUtils } from "@/services/core/headers-utils";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { endSession, hasSessionHint } from "@/services/core/session";
import type {
  ApiResponseError,
  ApiService,
  HttpInterceptorSetup,
  RefreshOptions,
  ServiceRefreshConfig,
} from "@/services/core/types";
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const REFRESH_DEFAULTS: Omit<RefreshOptions, "service"> = {
  endpoint: "/auth/refresh",
  skipPaths: [],
  hasSession: hasSessionHint,
};

/** Refresh runtime for one service: its single-flight manager + resolved options. */
interface RefreshContext {
  manager: RefreshTokenManager;
  options: RefreshOptions;
}

/** Marker fields the interceptor inspects to recognize and route an envelope. */
interface EnvelopeBody {
  success?: boolean;
  error_code?: number;
}

/**
 * Treat a body as an API envelope only when it carries a boolean `success` —
 * the marker every backend success and error body carries. This avoids
 * misclassifying domain payloads that merely happen to have a `status` field
 * (e.g. `{ id, status: "done" }`), which would otherwise be rejected as errors.
 */
function isEnvelope(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as EnvelopeBody;
  return typeof b.success === "boolean";
}

/** Request path without query string / hash, for exact endpoint matching. */
function pathOf(config: InternalAxiosRequestConfig): string {
  return (config.url ?? "").split(/[?#]/)[0] ?? "";
}

/** Whether the request targets the refresh endpoint or a credential endpoint
 * (login/register/logout) — their 401 is final, never a reason to refresh. */
function isRefreshExempt(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  const path = pathOf(config);
  return [options.endpoint, ...options.skipPaths].some((p) => path === p || path.endsWith(p));
}

/**
 * A 401 is eligible for an automatic refresh only when the request has not
 * already been replayed, it is not a refresh/credential call, and a session is
 * believed to exist. Auth lives in httpOnly cookies (invisible to JS), so the
 * session check reads the readable session hint — an anonymous 401 is final
 * and never costs a refresh round-trip.
 */
function canAttemptRefresh(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  if (config._retry) return false;
  if (isRefreshExempt(config, options)) return false;
  return options.hasSession();
}

/** Dev-only hint: a rejected signature is a clock or secret problem, not a session one. */
function warnHmacRejected(): void {
  if (import.meta.env.DEV) {
    console.warn(
      "Request signature rejected (HMAC_ERROR): check the device clock and that VITE_HMAC_SECRET matches the backend HMAC_SECRET.",
    );
  }
}

interface ResponseInterceptorOpts {
  strictBlobError: boolean;
  instance: AxiosInstance;
  resolveRefresh: (service: ApiService) => RefreshContext | null;
}

function createResponseInterceptor(opts: ResponseInterceptorOpts) {
  const serviceOf = (config?: InternalAxiosRequestConfig): ApiService =>
    (config?.serviceType ?? "MAIN") as ApiService;

  const { strictBlobError, instance, resolveRefresh } = opts;

  /** Replay the original request after refreshing the right service; null when
   * not eligible (no refresh for this service, anonymous, credential endpoint,
   * already retried). A refused refresh rejects with the ORIGINAL 401; one
   * blocked or abandoned because the session ended (logout) rejects with
   * `SessionEndedError` (`{ error_code: 401, message: "session_ended" }`); a
   * transient refresh failure rejects with a retryable non-401 error (session
   * kept); a later non-auth failure of the replay (e.g. 500) propagates as-is. */
  const refreshAndRetry = (
    config: InternalAxiosRequestConfig | undefined,
    unauthorized: ApiResponseError,
  ): Promise<AxiosResponse> | null => {
    if (!config) return null;
    // A rejected signature says nothing about the session: no refresh, no replay.
    if (isHmacError(unauthorized)) return null;
    const ctx = resolveRefresh(serviceOf(config));
    if (!ctx || !canAttemptRefresh(config, ctx.options)) return null;
    config._retry = true;
    // The refresh rotates the httpOnly auth cookies; replay the original request
    // as-is — the browser re-attaches the fresh cookie (no Bearer to set).
    return ctx.manager.refresh(config._sentAt).then(
      () => instance(config),
      (refreshError: unknown) => {
        if (isHmacError(refreshError)) warnHmacRejected();
        return Promise.reject<AxiosResponse>(
          refreshError instanceof SessionEndedError
            ? refreshError
            : isRefreshRefused(refreshError)
              ? unauthorized
              : isHmacError(refreshError)
                ? refreshHmacRejected(refreshError)
                : refreshUnavailable(refreshError),
        );
      },
    );
  };

  const onSuccess = (response: AxiosResponse) => {
    if (response.data instanceof Blob) {
      if (!strictBlobError || (response.status >= 200 && response.status < 300)) {
        return response.data;
      }
      return Promise.reject<ApiResponseError>({
        status: "error",
        error_code: response.status,
        error_message: response.statusText || "blob_error",
        message: response.statusText || "blob_error",
      });
    }
    // Unwrap a recognized envelope; otherwise pass the raw response through.
    if (isEnvelope(response.data)) {
      const body = response.data as EnvelopeBody;
      if (body.success === true) return response.data;
      if (body.error_code === 401) {
        const retry = refreshAndRetry(response.config, response.data as ApiResponseError);
        if (retry) return retry;
      }
      return Promise.reject<ApiResponseError>(response.data as ApiResponseError);
    }
    return response;
  };

  // A 401 that is not refreshed simply rejects — never a page reload. Anonymous
  // and credential 401s are final; httpOnly cookies are cleared by the backend.
  const onError = (error: AxiosError<ApiResponseError>) => {
    const errorData = toApiError(error);
    if (error.response?.status === 401) {
      const retry = refreshAndRetry(error.config, errorData);
      if (retry) return retry;
      if (isHmacError(errorData)) warnHmacRejected();
    }
    if (error.code === "ERR_NETWORK" || error.code === "ERR_BLOCKED_BY_CLIENT") {
      console.error("Network error. Please check your internet connection.");
    }
    return Promise.reject<ApiResponseError>(errorData);
  };

  return [onSuccess, onError] as const;
}

export class ApiInterceptors implements HttpInterceptorSetup {
  private readonly configs = new Map<ApiService, RefreshOptions>();
  private readonly contexts = new Map<ApiService, RefreshContext>();

  constructor(refreshByService: Record<string, ServiceRefreshConfig> = {}) {
    for (const [service, opts] of Object.entries(refreshByService)) {
      this.configs.set(service, { ...REFRESH_DEFAULTS, ...opts, service });
    }
  }

  /** Lazily build (and cache) the single-flight manager for one service. */
  private getRefreshContext(service: ApiService): RefreshContext | null {
    const options = this.configs.get(service);
    if (!options) return null;
    let ctx = this.contexts.get(service);
    if (!ctx) {
      const manager = new RefreshTokenManager({
        service,
        refresh: createTokenRefresher(options.endpoint, service),
        onRefreshed: options.onRefreshed,
        // Another tab logged out while this one waited for the lock → no refresh.
        isSessionAlive: options.hasSession,
        // Session is dead: end it (the main session also drops the hint and the
        // cached queries); the caller gets the original 401.
        onRefreshFailed: () => endSession("expired", service),
      });
      ctx = { manager, options };
      this.contexts.set(service, ctx);
    }
    return ctx;
  }

  /**
   * Refresh one service's session outside the response interceptor (e.g. after a
   * server function reports an expired session). Same single-flight + cross-tab
   * lock as an interceptor-driven refresh — pass `sentAt` (when the failed call
   * started) so a refresh another tab finished after it is reused. Rejects when
   * the service has no refresh configured or the refresh fails (a refused one
   * ends the session).
   */
  refreshSession(service: ApiService = "MAIN", sentAt?: number): Promise<void> {
    const ctx = this.getRefreshContext(service);
    if (!ctx) return Promise.reject(new Error(`No refresh configured for service ${service}`));
    return ctx.manager.refresh(sentAt);
  }

  setupRequestInterceptor(instance: AxiosInstance, service: ApiService): void {
    instance.interceptors.request.use(
      (config) => {
        config.serviceType = service;
        // Kept on the replay: a refresh finished after this moment already
        // rotated the cookies, so the manager skips a second refresh.
        config._sentAt ??= Date.now();
        // HMAC headers only — the httpOnly auth cookie is sent automatically
        // (the axios instance is created with `withCredentials: true`).
        config.headers = HeadersUtils.setAuthHeaders(config);
        return config;
      },
      (error) => Promise.reject(error instanceof Error ? error : new Error(String(error))),
    );
  }

  setupResponseInterceptor(instance: AxiosInstance): void {
    instance.interceptors.response.use(
      ...createResponseInterceptor({
        strictBlobError: true,
        instance,
        resolveRefresh: (service) => this.getRefreshContext(service),
      }),
    );
  }
}
