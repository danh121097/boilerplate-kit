import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";
import type { ApiService } from "./types";
import { getAuthToken } from "./auth-token-storage";
import { HMACSignatureGenerator } from "./hmac-signature";

export class HeadersUtils {
  /** Attach HMAC signature headers if a secret is configured. */
  static setAuthHeaders(config: InternalAxiosRequestConfig): AxiosRequestHeaders {
    const sig = HMACSignatureGenerator.generateSignature(config);
    return sig
      ? ({ ...config.headers, ...sig } as unknown as AxiosRequestHeaders)
      : (config.headers as AxiosRequestHeaders);
  }

  /** Attach Bearer token from the matching storage slot for the service. */
  static addAuthorizationHeader(
    config: InternalAxiosRequestConfig,
    service: ApiService,
  ): void {
    const token = getAuthToken(service);
    if (token) config.headers.authorization = `Bearer ${token}`;
  }
}
