import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { ApiService } from "@/services/core/types";
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

/** An Authorization header is already set: `AxiosHeaders.has` when available,
 * else a case-insensitive key scan of a plain header object. */
function hasAuthorization(config: InternalAxiosRequestConfig): boolean {
  const headers = config.headers as unknown as
    (Record<string, unknown> & { has?: (name: string) => boolean }) | undefined;
  if (!headers) return false;
  if (typeof headers.has === "function") return headers.has("authorization");
  return Object.keys(headers).some((k) => k.toLowerCase() === "authorization" && headers[k]);
}

export class HeadersUtils {
  /** Attach HMAC signature headers if a secret is configured. */
  static setAuthHeaders(config: InternalAxiosRequestConfig): AxiosRequestHeaders {
    const sig = HMACSignatureGenerator.generateSignature(config);
    return sig
      ? ({ ...config.headers, ...sig } as unknown as AxiosRequestHeaders)
      : (config.headers as AxiosRequestHeaders);
  }

  /**
   * Attach the Bearer token from the matching storage slot for the service,
   * unless the caller already set one (logout sends the access token it
   * captured before ending the session). Storage reads are async, so this is `async` — the request
   * interceptor awaits it (axios awaits a promise-returning request interceptor).
   */
  static async addAuthorizationHeader(
    config: InternalAxiosRequestConfig,
    service: ApiService,
  ): Promise<void> {
    if (hasAuthorization(config)) return;
    const token = await getAccessToken(service);
    if (token) config.headers.authorization = `Bearer ${token}`;
  }
}
