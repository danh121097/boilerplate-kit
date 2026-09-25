import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { ApiService } from "@/services/core/types";
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

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
   * unless the caller already set one (logout sends the token it read before
   * clearing). SecureStore reads are async, so this is `async` — the request
   * interceptor awaits it (axios awaits a promise-returning request interceptor).
   */
  static async addAuthorizationHeader(
    config: InternalAxiosRequestConfig,
    service: ApiService,
  ): Promise<void> {
    const headers = (config.headers ?? {}) as unknown as Record<string, unknown>;
    if (Object.keys(headers).some((k) => k.toLowerCase() === "authorization" && headers[k])) {
      return;
    }
    const token = await getAccessToken(service);
    if (token) config.headers.authorization = `Bearer ${token}`;
  }
}
