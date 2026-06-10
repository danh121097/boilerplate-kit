import type { HMACSignatureData } from "./types";
import type { InternalAxiosRequestConfig } from "axios";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/** Inputs for a request signature. `path` must be the request path WITHOUT the
 * API prefix and WITHOUT the query string — exactly what the backend signs
 * (Express strips the `apiPrefix` mount and the query before verifying). */
export interface SignRequestInput {
  method: string;
  path: string;
  contentType?: string;
  /** Injectable timestamp — defaults to now; pass a fixed value for parity tests. */
  ctime?: number;
}

/**
 * HMAC signature generator for API request authentication.
 * Computes a signature header set; only active when VITE_HMAC_SECRET is set.
 *
 * TanStack Start uses Vite, so env vars are read via `import.meta.env.VITE_*`
 * identical to the SPA reactjs template. The secret is client-readable (soft
 * layer) — it matches the backend's HMAC_SECRET for request integrity.
 *
 * `signRequest` is the pure core, reused by both the axios interceptor (client)
 * and server functions (SSR), so a forwarded SSR fetch carries the same headers
 * the backend requires of every request.
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
   * after baseURL, i.e. without the API prefix). */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType: (config.headers?.["Content-Type"] as string) || "application/json",
    });
  }
}
