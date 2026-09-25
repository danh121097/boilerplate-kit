import { createTokenRefresher } from "@/services/core/auth-refresh-client";
import {
  clearServiceTokens,
  getAccessToken,
  getSessionEpoch,
} from "@/services/core/auth-token-storage";
import { HeadersUtils } from "@/services/core/headers-utils";
import { SessionClearedError } from "@/services/core/refresh-errors";
import { RefreshTokenManager } from "@/services/core/refresh-token-manager";
import type {
  ApiResponseError,
  ApiService,
  HttpInterceptorSetup,
  RefreshOptions,
  ServiceRefreshConfig,
  SessionExpiredHandler,
} from "@/services/core/types";
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const REFRESH_DEFAULTS: Omit<RefreshOptions, "service"> = {
  endpoint: "/auth/refresh",
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

/**
 * A 401 is eligible for an automatic refresh only when the request has not
 * already been replayed, it is not the refresh call itself, and we hold an access
 * token for that service (so anonymous traffic never triggers a refresh storm).
 * The token read is async (SecureStore), so this returns a promise.
 */
async function canAttemptRefresh(
  config: InternalAxiosRequestConfig,
  options: RefreshOptions,
): Promise<boolean> {
  if (config._retry) return false;
  if ((config.url ?? "").includes(options.endpoint)) return false;
  return Boolean(await getAccessToken(options.service));
}

interface ResponseInterceptorOpts {
  strictBlobError: boolean;
  instance: AxiosInstance;
  resolveRefresh: (service: ApiService) => RefreshContext | null;
  onSessionExpired: SessionExpiredHandler;
}

function createResponseInterceptor(opts: ResponseInterceptorOpts) {
  const serviceOf = (config?: InternalAxiosRequestConfig): ApiService =>
    (config?.serviceType ?? "MAIN") as ApiService;

  const { strictBlobError, instance, resolveRefresh, onSessionExpired } = opts;

  /** Replay the original request after refreshing the right service; resolves to
   * null when not eligible (no refresh for this service, anonymous, already
   * retried, ...). When eligible it returns the replay promise, so awaiting the
   * result carries the replay's OWN outcome — a later non-auth failure (e.g. 500)
   * propagates as-is and must NOT clear the refreshed token. */
  const refreshAndRetry = async (
    config: InternalAxiosRequestConfig | undefined,
  ): Promise<AxiosResponse | null> => {
    if (!config) return null;
    const ctx = resolveRefresh(serviceOf(config));
    if (!ctx || !(await canAttemptRefresh(config, ctx.options))) return null;
    config._retry = true;
    return ctx.manager.getFreshToken().then((token) => {
      config.headers.authorization = `Bearer ${token}`;
      return instance(config);
    });
  };

  /** Cleanup when an authenticated 401 cannot be recovered by a refresh: drop that service's
   * tokens and fire the injected session-expired callback (RN has no page reload;
   * the app navigates back to /login). A refresh-capable service whose refresh is
   * REJECTED (401/403) fires the same callback via the manager's onRefreshFailed;
   * a transient refresh failure (offline, timeout, 429, 5xx) rejects the request
   * with a retryable `RefreshUnavailableError` and keeps the tokens. */
  const handleUnauthorized = async (config?: InternalAxiosRequestConfig) => {
    const service = serviceOf(config);
    await clearServiceTokens(service);
    onSessionExpired(service);
  };

  /**
   * Route a 401. Resolves to the replayed response when a refresh recovered it,
   * or to null when the 401 should be rejected with the server's own body.
   * - credential endpoints (`skipAuthRefresh`): passed through untouched;
   * - the session was cleared after the request was sent (logout, expiry): rejects
   *   `SessionClearedError` (`session_ended`) — no refresh, no clear, no expiry;
   * - refreshable: refresh + replay;
   * - a session that cannot be recovered: clear it and fire session-expired;
   * - anonymous (no token): passed through.
   */
  const handle401 = async (
    config: InternalAxiosRequestConfig | undefined,
  ): Promise<AxiosResponse | null> => {
    if (!config || config.skipAuthRefresh) return null;
    const service = serviceOf(config);
    if (config._sessionEpoch !== undefined && config._sessionEpoch !== getSessionEpoch(service)) {
      throw new SessionClearedError();
    }
    const retry = await refreshAndRetry(config);
    if (retry) return retry;
    if (await getAccessToken(service)) await handleUnauthorized(config);
    return null;
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
    // Accepts either convention: { status: "success"|"error", ... } or { success, ... }.
    if (isEnvelope(response.data)) {
      const body = response.data as EnvelopeBody;
      if (body.status === "success" || body.success === true) return response.data;
      if (body.error_code === 401) {
        const retry = await handle401(response.config);
        if (retry) return retry;
      }
      return Promise.reject<ApiResponseError>(response.data as ApiResponseError);
    }
    return response;
  };

  const onError = async (error: AxiosError<ApiResponseError>) => {
    if (error.response?.status === 401) {
      // Eligible → refresh + replay; let the replay's own outcome propagate so a
      // transient post-refresh failure does not wrongly clear the new token. A
      // failed refresh throws out of here as-is (rejected → session already
      // expired by the manager; transient → retryable, tokens kept).
      const retry = await handle401(error.config);
      if (retry) return retry;
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
  private readonly onSessionExpired: SessionExpiredHandler;

  /**
   * @param refreshByService Map of service name → refresh config. A service is
   * auto-refreshed iff it appears here; omit a service to opt out.
   * @param onSessionExpired Called when a service's session is unrecoverable (a
   * non-refreshable 401, or the refresh endpoint rejecting with 401/403). The app wires this to clear auth
   * state + navigate to `/login`. Defaults to a no-op.
   */
  constructor(
    refreshByService: Record<string, ServiceRefreshConfig> = {},
    onSessionExpired: SessionExpiredHandler = () => {},
  ) {
    this.onSessionExpired = onSessionExpired;
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
        onRefreshFailed: () => this.onSessionExpired(service),
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
        onSessionExpired: this.onSessionExpired,
      }),
    );
  }
}
