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
import { endSession, getSessionEpoch, hasStoredSession } from "@/services/core/session";
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

/** Dev-only hint: an HMAC rejection (HTTP or socket handshake) is a signature / clock problem, not a session one. */
export function warnHmacRejected(): void {
  if (__DEV__) {
    console.warn(
      "[api] Request signature rejected (HMAC_ERROR): check the device clock and that EXPO_PUBLIC_HMAC_SECRET matches the backend.",
    );
  }
}

/** The normalized error for an HMAC rejection of the refresh call itself. */
function hmacRejected(error: unknown): ApiResponseError {
  warnHmacRejected();
  return { ...toApiError(error), errorType: "HMAC_ERROR", retryable: true };
}

/** The request path without its `?query` / `#hash`, and without the service's
 * `baseURL` when the url was given absolute — so it compares to a configured path
 * ("/auth/login") as the caller wrote it. */
function pathOf(config: InternalAxiosRequestConfig): string {
  let url = (config.url ?? "").split(/[?#]/)[0] ?? "";

  const base = config.baseURL?.replace(/\/+$/, "");
  if (base && url.startsWith(base)) url = url.slice(base.length);
  return url.startsWith("/") ? url : `/${url}`;
}

/** The refresh endpoint and the credential paths never trigger a refresh. An
 * exact match only: a suffix match would also exempt e.g. `/users/auth/login`. */
function isExempt(config: InternalAxiosRequestConfig, options: RefreshOptions): boolean {
  const path = pathOf(config);
  return [options.endpoint, ...options.skipPaths].includes(path);
}

/**
 * A 401 is eligible for an automatic refresh only when the request has not
 * already been replayed, it is not exempt, and a session exists for that service
 * (so anonymous traffic never triggers a refresh storm). The session check reads
 * SecureStore, so this returns a promise.
 */
async function canAttemptRefresh(
  config: InternalAxiosRequestConfig,
  options: RefreshOptions,
): Promise<boolean> {
  if (config._retry || isExempt(config, options)) return false;
  return Boolean(await options.hasSession());
}

/** The bare token the request was sent with, if any. */
function sentToken(config: InternalAxiosRequestConfig): string | null {
  const headers = (config.headers ?? {}) as unknown as Record<string, unknown>;
  const raw = String(headers.authorization ?? headers.Authorization ?? "");
  return raw.replace(/^Bearer /, "") || null;
}

interface ResponseInterceptorOpts {
  strictBlobError: boolean;
  instance: AxiosInstance;
  resolveRefresh: (service: ApiService) => RefreshContext | null;
}

const serviceOf = (config?: InternalAxiosRequestConfig): ApiService =>
  (config?.serviceType ?? "MAIN") as ApiService;

function createResponseInterceptor({
  strictBlobError,
  instance,
  resolveRefresh,
}: ResponseInterceptorOpts) {
  /** The session this request was sent under ended (logout, expiry): report it
   * as ended — never refresh it, clear anything or fire session-ended. Checked
   * again after every await, since a logout can land during any of them. */
  const assertSameSession = (config: InternalAxiosRequestConfig, service: ApiService) => {
    if (config._sessionEpoch !== undefined && config._sessionEpoch !== getSessionEpoch(service)) {
      throw new SessionEndedError();
    }
  };

  /**
   * Route a 401. Resolves to the replayed response when a refresh recovered it,
   * or to null when the 401 should go back to the caller as is:
   * - an HMAC rejection (`HMAC_ERROR`, bad signature / clock): passed through —
   *   no refresh, no replay, the session is untouched;
   * - no refresh for this service, or a credential/refresh endpoint: passed through;
   * - the session ended after the request was sent (logout, expiry): rejects
   *   `SessionEndedError` (`session_ended`) — no refresh, no clear, no event;
   * - anonymous, or already replayed once: passed through (a replay that 401s
   *   again does not end the session — only the refresh endpoint decides that);
   * - otherwise refresh + replay. A refused refresh (401/403) rejects with the
   *   ORIGINAL 401 (the manager already cleared the tokens and ended the
   *   session); a transient one rejects with a retryable `refresh_unavailable`
   *   and keeps the session; a refresh rejected for its own signature rejects
   *   with that normalized `HMAC_ERROR` and keeps the session. The replay's own outcome — e.g. a later 500 —
   *   propagates as is and must NOT clear the refreshed token.
   */
  const handle401 = async (
    config: InternalAxiosRequestConfig | undefined,
    unauthorized: ApiResponseError,
  ): Promise<AxiosResponse | null> => {
    if (!config) return null;
    if (isHmacError(unauthorized)) {
      warnHmacRejected();
      return null;
    }
    const service = serviceOf(config);
    const ctx = resolveRefresh(service);
    if (!ctx || isExempt(config, ctx.options)) return null;
    assertSameSession(config, service);
    const eligible = await canAttemptRefresh(config, ctx.options);
    assertSameSession(config, service);
    if (!eligible) return null;

    config._retry = true;
    let token: string;
    try {
      token = await ctx.manager.getFreshToken(sentToken(config));
    } catch (refreshError) {
      if (refreshError instanceof SessionEndedError) throw refreshError;
      throw isRefreshRefused(refreshError)
        ? unauthorized
        : isHmacError(refreshError)
          ? hmacRejected(refreshError)
          : refreshUnavailable(refreshError);
    }
    config.headers.authorization = `Bearer ${token}`;
    return instance(config);
  };

  const onSuccess = async (response: AxiosResponse) => {
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
        const retry = await handle401(response.config, response.data as ApiResponseError);
        if (retry) return retry;
      }
      return Promise.reject<ApiResponseError>(response.data as ApiResponseError);
    }
    return response;
  };

  const onError = async (error: AxiosError<ApiResponseError>) => {
    const errorData = toApiError(error);
    if (error.response?.status === 401) {
      const retry = await handle401(error.config, errorData);
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
 * token that was rejected (default: the stored one, read from SecureStore). A
 * refused refresh clears the tokens and ends the session before rejecting;
 * rejects with `SessionEndedError` when the session already ended, and with the
 * raw error otherwise (session kept). Rejects without a response when the
 * service has no refresh configured.
 */
export async function refreshSession(
  staleToken?: string | null,
  service: ApiService = "MAIN",
): Promise<string> {
  const ctx = activeInterceptors?.getRefreshContext(service);
  if (!ctx) throw new Error("refresh_not_configured");
  return ctx.manager.getFreshToken(
    staleToken === undefined ? await getAccessToken(service) : staleToken,
  );
}

export class ApiInterceptors implements HttpInterceptorSetup {
  private readonly configs = new Map<ApiService, RefreshOptions>();
  private readonly contexts = new Map<ApiService, RefreshContext>();

  /**
   * @param refreshByService Map of service name → refresh config. A service is
   * auto-refreshed iff it appears here; omit a service to opt out. A refused
   * refresh ends that service's session (`endSession("expired", service)`);
   * the app subscribes with `onSessionEnded` and filters on its auth service.
   */
  constructor(refreshByService: Record<string, ServiceRefreshConfig> = {}) {
    for (const [service, opts] of Object.entries(refreshByService)) {
      this.configs.set(service, {
        ...REFRESH_DEFAULTS,
        ...opts,
        hasSession: opts.hasSession ?? (() => hasStoredSession(service)),
        service,
      });
    }
    setActiveInterceptors(this);
  }

  /** Lazily build (and cache) the single-flight manager for one service.
   * @internal used by `refreshSession`. */
  getRefreshContext(service: ApiService): RefreshContext | null {
    const options = this.configs.get(service);
    if (!options) return null;
    let ctx = this.contexts.get(service);
    if (!ctx) {
      const manager = new RefreshTokenManager({
        service,
        refresh: createTokenRefresher(options.endpoint, service),
        onRefreshed: options.onRefreshed,
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
      async (config) => {
        config.serviceType = service;
        // Stamped before the async token read: a clear landing mid-read still
        // counts as "after send".
        config._sessionEpoch = getSessionEpoch(service);
        config.headers = HeadersUtils.setAuthHeaders(config);
        await HeadersUtils.addAuthorizationHeader(config, service);
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
