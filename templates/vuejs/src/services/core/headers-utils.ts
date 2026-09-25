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

  /** Attach Bearer token from the matching storage slot for the service, unless
   * the caller already set one (logout sends the token it captured). */
  static addAuthorizationHeader(config: InternalAxiosRequestConfig, service: ApiService): void {
    const headers = config.headers as unknown as { has?: (name: string) => boolean };
    if (headers.has ? headers.has("authorization") : config.headers.authorization) return;
    const token = getAccessToken(service);
    if (token) config.headers.authorization = `Bearer ${token}`;
  }
}
