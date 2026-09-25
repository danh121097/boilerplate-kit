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

/** The Content-Type pinned on the request (instance default or per-request),
 * looked up case-insensitively: `AxiosHeaders.get` when available, else a key
 * scan of a plain header object. */
function headerContentType(config: InternalAxiosRequestConfig): string | undefined {
  const headers = config.headers as unknown as
    | (Record<string, unknown> & { get?: (name: string) => unknown })
    | undefined;
  if (!headers) return undefined;
  const raw =
    typeof headers.get === "function"
      ? headers.get("Content-Type")
      : Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1];
  return typeof raw === "string" && raw ? raw : undefined;
}

/**
 * The Content-Type axios will actually send, which the backend signs:
 * - no body (`data === undefined`) → `""` (axios drops the header);
 * - a pinned Content-Type → that value, exactly as set (a pinned charset too);
 * - else axios's default for the body: `URLSearchParams` →
 *   `application/x-www-form-urlencoded;charset=utf-8`, a string →
 *   `application/x-www-form-urlencoded`, anything else → `application/json`.
 * `data: null` counts as a body (axios sends `null`). Multipart is not
 * supported: the browser adds a boundary the client cannot know when signing.
 */
export function resolveContentType(config: InternalAxiosRequestConfig): string {
  if (config.data === undefined) return "";
  const pinned = headerContentType(config);
  if (pinned) return pinned;
  if (config.data instanceof URLSearchParams) {
    return "application/x-www-form-urlencoded;charset=utf-8";
  }
  if (typeof config.data === "string") return "application/x-www-form-urlencoded";
  return "application/json";
}

/**
 * HMAC request signer — active only when `VITE_HMAC_SECRET` is set. The secret is
 * client-readable (a soft integrity layer matching the backend's HMAC_SECRET).
 * `signRequest` is the pure core, reused by the axios interceptor and SSR server
 * functions so a forwarded SSR fetch carries the same headers the backend requires.
 */
export class HMACSignatureGenerator {
  /** The path the backend verifies: leading "/", no query string or hash (it
   * signs `req.url` with the query stripped, so an inline `?x=1` must not be
   * signed either). */
  private static normalizeUrl(url: string): string {
    const path = url.split(/[?#]/)[0] ?? "";
    return path.startsWith("/") ? path : `/${path}`;
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
   * after baseURL, i.e. without the API prefix) with the Content-Type the
   * request actually sends (`resolveContentType`). */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType: resolveContentType(config),
    });
  }
}
