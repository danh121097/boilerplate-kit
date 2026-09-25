import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { ApiService } from "@/services/core/types";
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

/** An Authorization header is already set (any casing). */
function hasAuthorization(headers: unknown): boolean {
  if (!headers || typeof headers !== "object") return false;
  const h = headers as { has?: (name: string) => boolean } & Record<string, unknown>;
  if (typeof h.has === "function") return h.has("authorization");
  return Object.entries(h).some(([key, value]) => key.toLowerCase() === "authorization" && value);
}

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
    if (hasAuthorization(config.headers)) return;
    const token = getAccessToken(service);
    if (token) config.headers.authorization = `Bearer ${token}`;
  }
}
