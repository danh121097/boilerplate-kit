import {
  isRefreshRefused,
  refreshUnavailable,
  SessionEndedError,
  toApiError,
} from "@/services/core/api-errors";
import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { HeadersUtils } from "@/services/core/headers-utils";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { endSession, hasStoredSession } from "@/services/core/session";
import type {
  ApiResponseError,
  ApiService,
  HttpInterceptorSetup,
  RefreshOptions,
  ServiceRefreshConfig,
} from "@/services/core/types";
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const REFRESH_DEFAULTS: Omit<RefreshOptions, "service" | "hasSession"> = {
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
 * believed to exist (a token is stored for that service), so anonymous traffic
 * never triggers a refresh storm.
 */
function canAttemptRefresh(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  if (config._retry) return false;
  if (isRefreshExempt(config, options)) return false;
  return options.hasSession();
}

/** The bare access token a request was sent with (null when anonymous). */
function sentAccessToken(config: InternalAxiosRequestConfig): string | null {
  const raw = config.headers?.authorization;
  return typeof raw === "string" ? raw.replace(/^Bearer /, "") : null;
}

interface ResponseInterceptorOpts {
  strictBlobError: boolean;
  instance: AxiosInstance;
  resolveRefresh: (service: ApiService) => RefreshContext | null;
}

function createResponseInterceptor(opts: ResponseInterceptorOpts) {
  const { strictBlobError, instance, resolveRefresh } = opts;

  const serviceOf = (config?: InternalAxiosRequestConfig): ApiService =>
    (config?.serviceType ?? "MAIN") as ApiService;

  /** Replay the original request after refreshing the right service; null when
   * not eligible (no refresh for this service, anonymous, credential endpoint,
   * already retried). A refused refresh rejects with the ORIGINAL 401; one
   * blocked or abandoned because the session ended (logout) rejects with
   * `SessionEndedError` (`{ error_code: 401, message: "session_ended" }`); a
   * transient refresh failure rejects with a retryable non-401 error (session
   * kept). The replay's own outcome propagates as-is — a later 500, or a 401
   * again, neither clears the refreshed token nor ends the session. */
  const refreshAndRetry = (
    config: InternalAxiosRequestConfig | undefined,
    unauthorized: ApiResponseError,
  ): Promise<AxiosResponse> | null => {
    if (!config) return null;
    const ctx = resolveRefresh(serviceOf(config));
    if (!ctx || !canAttemptRefresh(config, ctx.options)) return null;
    config._retry = true;
    return ctx.manager.getFreshToken(sentAccessToken(config)).then(
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
    // Envelope shape: { success: true, data, ... } on success, { success: false, ... } on failure.
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

  // A 401 that is not refreshed simply rejects — never a page reload and never a
  // session end: only the refresh endpoint decides the session is gone.
  const onError = (error: AxiosError<ApiResponseError>) => {
    const errorData = toApiError(error);
    if (error.response?.status === 401) {
      const retry = refreshAndRetry(error.config, errorData);
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
      this.configs.set(service, {
        ...REFRESH_DEFAULTS,
        hasSession: () => hasStoredSession(service),
        ...opts,
        service,
      });
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
        // Refused refresh: the manager already cleared the tokens; end the session.
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
