import type { HMACSignatureData } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

export interface SignRequestInput {
  method: string;
  path: string;
  contentType?: string;
  ctime?: number;
}

/**
 * HMAC request signer — active only when `VITE_HMAC_SECRET` is set. The secret is
 * client-readable (a soft integrity layer matching the backend's HMAC_SECRET).
 * `signRequest` is the pure core, reused by the axios interceptor and SSR server
 * functions so a forwarded SSR fetch carries the same headers the backend requires.
 */
export class HMACSignatureGenerator {
  private static normalizeUrl(url: string): string {
    return url.startsWith("/") ? url : `/${url}`;
  }

  private static sign(stringToSign: string, secret: string): string {
    return Base64.stringify(HmacSHA256(stringToSign, secret));
  }

  /** Pure signer. Returns null when no secret is configured. */
  static signRequest({
    method,
    path,
    contentType = "application/json",
    ctime = Date.now(),
  }: SignRequestInput): HMACSignatureData | null {
    const secret = import.meta.env.VITE_HMAC_SECRET;
    if (!secret) return null;

    const xVersion = import.meta.env.VITE_BUILD_VERSION || "1.0.0";
    const stringToSign = [
      method.toUpperCase(),
      contentType,
      ctime,
      this.normalizeUrl(path),
      "",
    ].join("\n");

    return { sig: this.sign(stringToSign, secret), ctime, "x-version": xVersion };
  }

  /** Adapter for the axios interceptor — signs `config.url` (already the path
   * after baseURL, i.e. without the API prefix).
   *
   * The signed content-type MUST equal what the request actually sends, because
   * the backend signs the `Content-Type` header it receives. axios omits
   * Content-Type on body less requests (GET, or POST/DELETE with no data), so we
   * sign "" for those and "application/json" only when a body is present. A
   * request that pins its own content-type (e.g. multipart form-data) keeps it. */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    const pinned = config.headers?.["Content-Type"] as string | undefined;
    const isMultipart = typeof pinned === "string" && pinned.startsWith("multipart");
    const hasBody = config.data !== undefined && config.data !== null;
    const contentType = isMultipart ? pinned : hasBody ? "application/json" : "";

    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType,
    });
  }
}
