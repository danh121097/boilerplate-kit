import { createTokenRefresher } from "./auth-refresh-client";
import { HeadersUtils } from "./headers-utils";
import { RefreshTokenManager } from "./refresh-token-manager";
import type {
  ApiResponseError,
  ApiService,
  HttpInterceptorSetup,
  RefreshOptions,
  ServiceRefreshConfig,
} from "./types";
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const REFRESH_DEFAULTS: Omit<RefreshOptions, "service"> = {
  endpoint: "/auth/refresh",
  reloadOnFailure: true,
};

/**
 * Reload the current page — guarded so it no-ops during SSR.
 * Next.js runs React on both server and client; window is absent on the server.
 */
function reloadPage(): void {
  if (typeof window !== "undefined") window.location.reload();
}

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

/**
 * A 401 is eligible for an automatic refresh only when the request has not
 * already been replayed and it is not the refresh call itself. Auth lives in
 * httpOnly cookies (invisible to JS), so eligibility cannot gate on a stored
 * token — a single replay-guarded attempt covers both expired-session and
 * genuinely-anonymous cases (the latter just fails the refresh and is handled).
 */
function canAttemptRefresh(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  if (config._retry) return false;
  if ((config.url ?? "").includes(options.endpoint)) return false;
  return true;
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
   * not eligible (no refresh for this service, anonymous, already retried, ...).
   * The returned promise carries the replay's own outcome — a later non-auth
   * failure (e.g. 500) propagates as-is and must NOT clear the refreshed token. */
  const refreshAndRetry = (
    config: InternalAxiosRequestConfig | undefined,
  ): Promise<AxiosResponse> | null => {
    if (!config) return null;
    const ctx = resolveRefresh(serviceOf(config));
    if (!ctx || !canAttemptRefresh(config, ctx.options)) return null;
    config._retry = true;
    // The refresh rotates the httpOnly auth cookies; replay the original request
    // as-is — the browser re-attaches the fresh cookie (no Bearer to set).
    return ctx.manager.refresh().then(() => instance(config));
  };

  /** When a 401 cannot be recovered by a refresh, reload only if the service has
   * no refresh configured (nothing can recover it). httpOnly cookies can't be
   * cleared from JS — the backend clears them on logout / failed refresh. A
   * refresh-capable service handles its own reload on actual refresh failure. */
  const handleUnauthorized = (config?: InternalAxiosRequestConfig) => {
    if (!resolveRefresh(serviceOf(config))) reloadPage();
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
      if (body.status === "success" || body.success === true) return response.data;
      if (body.error_code === 401) {
        const retry = refreshAndRetry(response.config);
        if (retry) return retry;
        handleUnauthorized(response.config);
      }
      return Promise.reject<ApiResponseError>(response.data as ApiResponseError);
    }
    return response;
  };

  const onError = (error: AxiosError<ApiResponseError>) => {
    if (error.response?.status === 401) {
      const retry = refreshAndRetry(error.config);
      if (retry) return retry;
      handleUnauthorized(error.config);
    }
    if (error.code === "ERR_NETWORK" || error.code === "ERR_BLOCKED_BY_CLIENT") {
      console.error("Network error. Please check your internet connection.");
    }
    const errorData = error.response?.data ?? { message: error.message };
    return Promise.reject<ApiResponseError>(errorData as ApiResponseError);
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
        onRefreshFailed: () => {
          if (options.reloadOnFailure) reloadPage();
        },
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
