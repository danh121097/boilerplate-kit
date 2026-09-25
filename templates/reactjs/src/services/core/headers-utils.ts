import { getAccessToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { ApiService } from "@/services/core/types";
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

type HeaderBag = Record<string, unknown> & { has?: (name: string) => boolean };

/** Whether the request already carries an Authorization header (any casing). */
function hasAuthorization(config: InternalAxiosRequestConfig): boolean {
  const headers = config.headers as unknown as HeaderBag | undefined;
  if (!headers) return false;
  if (typeof headers.has === "function") return headers.has("authorization");
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === "authorization" && Boolean(headers[key]),
  );
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
   * the caller already set one (logout sends the access token it captured). */
  static addAuthorizationHeader(config: InternalAxiosRequestConfig, service: ApiService): void {
    if (hasAuthorization(config)) return;
    const token = getAccessToken(service);
    if (token) config.headers.authorization = `Bearer ${token}`;
  }
}
