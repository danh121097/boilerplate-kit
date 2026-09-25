import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { getAccessToken, getRefreshToken } from "@/services/core/auth-token-storage";
import { HeadersUtils } from "@/services/core/headers-utils";
import {
  isRefreshRefused,
  RefreshTokenManager,
  SessionEndedError,
} from "@/services/core/refresh-token-manager";
import { endSession } from "@/services/core/session-events";
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
};

/** Refresh runtime for one service: its single-flight manager + resolved options. */
interface RefreshContext {
  manager: RefreshTokenManager;
  options: RefreshOptions;
}

/** Marker fields the interceptor inspects to recognize and route an envelope. */
interface EnvelopeBody {
  status?: string;
  success?: boolean;
  error_code?: number;
}

/**
 * Treat a body as an API envelope only when it carries a recognized marker —
 * `status` of "success"/"error", or a boolean `success`. This avoids
 * misclassifying domain payloads that merely happen to have a `status` field
 * (e.g. `{ id, status: "done" }`), which would otherwise be rejected as errors.
 */
function isEnvelope(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as EnvelopeBody;
  return b.status === "success" || b.status === "error" || typeof b.success === "boolean";
}

function pathOf(config: InternalAxiosRequestConfig): string {
  return (config.url ?? "").split(/[?#]/)[0] ?? "";
}

/** Whether the request targets the refresh endpoint or a credential endpoint
 * (login/register/logout) — their 401 is final, never a reason to refresh. */
function isRefreshExempt(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  const path = pathOf(config);
  return [options.endpoint, ...options.skipPaths].some((p) => path === p || path.endsWith(p));
}

/** A session is believed to exist while the service holds either token. */
function hasSession(service: ApiService): boolean {
  return Boolean(getAccessToken(service) || getRefreshToken(service));
}

/**
 * A 401 is eligible for an automatic refresh only when the request has not
 * already been replayed, it is not a refresh/credential call, and we hold a
 * token for that service (so anonymous traffic never triggers a refresh storm).
 */
function canAttemptRefresh(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  if (config._retry) return false;
  if (isRefreshExempt(config, options)) return false;
  return hasSession(options.service);
}

/** A request that could not be replayed because the refresh itself failed
 * transiently. Deliberately NOT a 401, so callers keep the session. */
function refreshUnavailable(error: unknown): ApiResponseError {
  const status = (error as { response?: { status?: number } } | null)?.response?.status ?? 0;
  const message = "Session refresh temporarily unavailable";
  return { status: "error", error_code: status, message, error_message: message, retryable: true };
}

/** No response at all (network / timeout), 408, 429 or 5xx — worth retrying later. */
function isTransientStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/** Normalize a rejected response into the `ApiResponseError` shape, filling
 * `error_code` from the HTTP status (0 when there was no response) when the
 * body does not carry one, and flagging transient failures `retryable`. */
function toApiError(error: AxiosError<ApiResponseError>): ApiResponseError {
  const status = error.response?.status;
  const body = error.response?.data;
  const retryable = isTransientStatus(status) ? { retryable: true } : {};
  if (body && typeof body === "object") {
    return {
      ...body,
      error_code: body.error_code || status || 0,
      ...retryable,
    } as ApiResponseError;
  }
  return {
    status: "error",
    message: error.message,
    error_code: status ?? 0,
    ...retryable,
  } as ApiResponseError;
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
   * not eligible (no refresh for this service, anonymous, already retried, ...).
   * A refused refresh rejects with the ORIGINAL 401; one blocked or abandoned
   * because the session ended (logout) rejects with `SessionEndedError`
   * (`{ error_code: 401, message: "session_ended" }`); a transient refresh
   * failure rejects with a retryable non-401 error (session kept). The replay's
   * own outcome — e.g. a later 500 — propagates as-is and must NOT clear the
   * refreshed token. */
  const refreshAndRetry = (
    config: InternalAxiosRequestConfig | undefined,
    unauthorized: ApiResponseError,
  ): Promise<AxiosResponse> | null => {
    if (!config) return null;
    const ctx = resolveRefresh(serviceOf(config));
    if (!ctx || !canAttemptRefresh(config, ctx.options)) return null;
    config._retry = true;
    const stale = String(config.headers.authorization ?? "").replace(/^Bearer /, "") || null;
    return ctx.manager.getFreshToken(stale).then(
      (token) => {
        config.headers.authorization = `Bearer ${token}`;
        return instance(config);
      },
      (refreshError: unknown) =>
        Promise.reject<AxiosResponse>(
          refreshError instanceof SessionEndedError
            ? refreshError
            : isRefreshRefused(refreshError)
              ? unauthorized
              : refreshUnavailable(refreshError),
        ),
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
    // Accepts either convention: { status: "success"|"error", ... } or { success, ... }.
    if (isEnvelope(response.data)) {
      const body = response.data as EnvelopeBody;
      if (body.status === "success" || body.success === true) return response.data;
      if (body.error_code === 401) {
        const retry = refreshAndRetry(response.config, response.data as ApiResponseError);
        if (retry) return retry;
      }
      return Promise.reject<ApiResponseError>(response.data as ApiResponseError);
    }
    return response;
  };

  const onError = (error: AxiosError<ApiResponseError>) => {
    const errorData = toApiError(error);
    if (error.response?.status === 401) {
      // Eligible → refresh + replay; let the replay's own outcome propagate so a
      // transient post-refresh failure does not wrongly clear the new token.
      const retry = refreshAndRetry(error.config, errorData);
      // Not eligible (anonymous / credential / already replayed / no refresh):
      // the 401 goes back to the caller; only a refused refresh ends the session.
      if (retry) return retry;
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

  /**
   * @param refreshByService Map of service name → refresh config. A service is
   * auto-refreshed iff it appears here; omit a service to opt out.
   */
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
        // Another tab logged out while this one waited for the lock → no refresh.
        isSessionAlive: () => hasSession(service),
        onRefreshFailed: () => endSession("expired", service),
      });
      ctx = { manager, options };
      this.contexts.set(service, ctx);
    }
    return ctx;
  }

  setupRequestInterceptor(instance: AxiosInstance, service: ApiService): void {
    instance.interceptors.request.use(
      (config) => {
        config.serviceType = service;
        config.headers = HeadersUtils.setAuthHeaders(config);
        HeadersUtils.addAuthorizationHeader(config, service);
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
