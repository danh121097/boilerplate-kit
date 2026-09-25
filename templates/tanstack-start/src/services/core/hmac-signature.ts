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

/** The Content-Type pinned on the request config (AxiosHeaders or a plain object). */
function readContentType(config: InternalAxiosRequestConfig): string | undefined {
  const headers = config.headers as unknown as
    | (Record<string, unknown> & { get?: (name: string) => unknown })
    | undefined;
  const raw =
    typeof headers?.get === "function"
      ? headers.get("Content-Type")
      : (headers?.["Content-Type"] ?? headers?.["content-type"]);
  return typeof raw === "string" && raw ? raw : undefined;
}

/** The Content-Type pinned on the request, exactly as it will be sent. Pin no
 * charset: the backend signs the header it receives, so a pinned one must be
 * sent (and signed) unchanged. */
export function pinnedContentType(config: InternalAxiosRequestConfig): string | undefined {
  return readContentType(config);
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
   * after baseURL, i.e. without the API prefix).
   *
   * The signed content-type MUST equal what the request actually sends, because
   * the backend signs the `Content-Type` header it receives. axios omits
   * Content-Type on bodyless requests (GET, or POST with no data), so those sign
   * ""; a request with a body sends the pinned Content-Type (instance default or
   * per-request header, signed exactly as sent) or axios's JSON default.
   *
   * Not covered: multipart uploads. The browser sends
   * `multipart/form-data; boundary=…` with a boundary the client cannot know
   * when signing, so upload routes need a backend-side exemption or
   * normalization. */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    const hasBody = config.data !== undefined && config.data !== null;
    const contentType = hasBody ? (pinnedContentType(config) ?? "application/json") : "";

    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType,
    });
  }
}
