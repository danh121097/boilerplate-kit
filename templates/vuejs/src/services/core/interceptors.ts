import { toApiError } from "@/services/core/api-errors";
import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { clearServiceTokens, getAccessToken } from "@/services/core/auth-token-storage";
import { HeadersUtils } from "@/services/core/headers-utils";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import { notifySessionExpired } from "@/services/core/session-events";
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
  excludePaths: ["/auth/login", "/auth/register", "/auth/logout"],
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

/** True for the refresh endpoint and every configured credential endpoint —
 * a 401 there means wrong credentials / revoked token, not an expired session. */
function isCredentialRequest(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  const path = (config.url ?? "").split("?")[0] ?? "";
  return [options.endpoint, ...options.excludePaths].some((p) => path.endsWith(p));
}

/**
 * A 401 is eligible for an automatic refresh only when the request has not
 * already been replayed, it is not a credential call (login, refresh, ...), and
 * we hold an access token for that service (so anonymous traffic never triggers
 * a refresh storm).
 */
function canAttemptRefresh(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  if (config._retry) return false;
  if (isCredentialRequest(config, options)) return false;
  return Boolean(getAccessToken(options.service));
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
    return ctx.manager.getFreshToken(sentAccessToken(config)).then(
      (token) => {
        config.headers.authorization = `Bearer ${token}`;
        return instance(config);
      },
      // Refresh failed: reject with the refresh call's status (401 when the
      // session is gone, 0/5xx when transient) — never reload the page.
      (error) => Promise.reject(toApiError(error)),
    );
  };

  /** Cleanup when a 401 cannot be recovered by a refresh. Credential calls
   * (wrong password, ...) leave the session alone. Otherwise drop that service's
   * tokens; when a refresh-capable service held a session (e.g. the refreshed
   * replay is still 401), announce the expiry so the app can route to /login.
   * Never reloads — the caller receives the rejection. */
  const handleUnauthorized = (config?: InternalAxiosRequestConfig) => {
    const service = serviceOf(config);
    const ctx = resolveRefresh(service);
    if (config && ctx && isCredentialRequest(config, ctx.options)) return;
    const hadSession = Boolean(getAccessToken(service));
    clearServiceTokens(service);
    if (ctx && hadSession) notifySessionExpired(service);
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
      // Eligible → refresh + replay; let the replay's own outcome propagate so a
      // transient post-refresh failure does not wrongly clear the new token.
      const retry = refreshAndRetry(error.config);
      if (retry) return retry;
      // Not eligible (anonymous / already retried / no refresh) → genuine logout.
      handleUnauthorized(error.config);
    }
    if (error.code === "ERR_NETWORK" || error.code === "ERR_BLOCKED_BY_CLIENT") {
      console.error("Network error. Please check your internet connection.");
    }
    return Promise.reject<ApiResponseError>(toApiError(error));
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
        onRefreshFailed: () => notifySessionExpired(service),
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
