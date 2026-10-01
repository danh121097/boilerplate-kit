import {
  isHmacError,
  isRefreshRefused,
  refreshUnavailable,
  SessionEndedError,
  toApiError,
} from "@/services/core/api-errors";
import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import { getAccessToken } from "@/services/core/auth-token-storage";
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

/** Defaults for a service registered for refresh; `hasSession` defaults to
 * "the service holds an access or refresh token". */
function refreshDefaults(service: ApiService): Omit<RefreshOptions, "service"> {
  return {
    endpoint: "/auth/refresh",
    skipPaths: [],
    hasSession: () => hasStoredSession(service),
  };
}

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

/** Dev-only hint: an HMAC rejection is a signature / clock problem, not a session one. */
function warnHmacRejected(): void {
  if (import.meta.env.DEV) {
    console.warn(
      "[api] Request signature rejected (HMAC_ERROR): check the device clock and that VITE_HMAC_SECRET matches the backend.",
    );
  }
}

/** The normalized, retryable error for an HMAC rejection of the refresh call itself (session kept). */
function hmacRejected(error: unknown): ApiResponseError {
  warnHmacRejected();
  return { ...toApiError(error), retryable: true };
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

/**
 * A 401 is eligible for an automatic refresh only when the request has not
 * already been replayed, it is not a refresh/credential call, and a session
 * exists for that service (so anonymous traffic never triggers a refresh storm).
 */
function canAttemptRefresh(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  if (config._retry) return false;
  if (isRefreshExempt(config, options)) return false;
  return options.hasSession();
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
   * failure rejects with a retryable non-401 error (session kept); a refresh
   * rejected for its signature (`HMAC_ERROR`) rejects with that normalized error
   * (session kept). The replay's
   * own outcome — e.g. a later 500 — propagates as-is and must NOT clear the
   * refreshed token. */
  const refreshAndRetry = (
    config: InternalAxiosRequestConfig | undefined,
    unauthorized: ApiResponseError,
  ): Promise<AxiosResponse> | null => {
    if (!config) return null;
    // A rejected signature / clock is not a session problem: no refresh, no replay.
    if (isHmacError(unauthorized)) {
      warnHmacRejected();
      return null;
    }
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
              : isHmacError(refreshError)
                ? hmacRejected(refreshError)
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

/** The interceptors the app registered (the latest constructed), for `refreshSession`. */
let activeInterceptors: ApiInterceptors | null = null;
function setActiveInterceptors(interceptors: ApiInterceptors): void {
  activeInterceptors = interceptors;
}

/**
 * Refresh `service`'s session outside an HTTP request (e.g. a socket handshake
 * the server rejected), through the same single-flight manager as the 401
 * interceptor. Resolves to the fresh access token. `staleToken` is the access
 * token that was rejected (default: the stored one). A refused refresh clears the
 * tokens and ends the session before rejecting; rejects with `SessionEndedError`
 * when the session already ended, and with the raw error otherwise (session kept).
 * Rejects without a response when the service has no refresh configured.
 */
export function refreshSession(
  staleToken?: string | null,
  service: ApiService = "MAIN",
): Promise<string> {
  const ctx = activeInterceptors?.getRefreshContext(service);
  if (!ctx) return Promise.reject(new Error("refresh_not_configured"));
  return ctx.manager.getFreshToken(staleToken === undefined ? getAccessToken(service) : staleToken);
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
      this.configs.set(service, { ...refreshDefaults(service), ...opts, service });
    }
    setActiveInterceptors(this);
  }

  /** Lazily build (and cache) the single-flight manager for one service. */
  /** @internal used by `refreshSession`. */
  getRefreshContext(service: ApiService): RefreshContext | null {
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
