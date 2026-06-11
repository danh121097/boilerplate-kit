import { HMACSignatureGenerator } from "./hmac-signature";
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

export class HeadersUtils {
  /**
   * Attach HMAC signature headers if a secret is configured.
   *
   * Auth is cookie-based: the browser auto-attaches the httpOnly access-token
   * cookie (the axios client sets `withCredentials`), so no Authorization header
   * is built here.
   */
  static setAuthHeaders(config: InternalAxiosRequestConfig): AxiosRequestHeaders {
    const sig = HMACSignatureGenerator.generateSignature(config);
    return sig
      ? ({ ...config.headers, ...sig } as unknown as AxiosRequestHeaders)
      : (config.headers as AxiosRequestHeaders);
  }
}
