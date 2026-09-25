import type { HMACSignatureData } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

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
 * HMAC signature generator for API request authentication.
 * Computes a signature header set; only active when VITE_HMAC_SECRET is set.
 *
 * The signed content-type MUST equal what the request actually sends (the
 * backend signs the `Content-Type` header it receives): "" for a bodyless
 * request (axios drops the header), else the pinned Content-Type (exactly as
 * sent) or axios's JSON default.
 *
 * Not covered: multipart uploads. The browser sends
 * `multipart/form-data; boundary=…` with a boundary the client cannot know when
 * signing, so upload routes need a backend-side exemption or normalization.
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

  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    const secret = import.meta.env.VITE_HMAC_SECRET;
    if (!secret) return null;

    const path = this.normalizeUrl(config.url || "");
    const method = config.method?.toUpperCase() || "";
    const hasBody = config.data !== undefined && config.data !== null;
    const contentType = hasBody ? (pinnedContentType(config) ?? "application/json") : "";
    const ctime = Date.now();
    const xVersion = import.meta.env.VITE_BUILD_VERSION || "1.0.0";

    const stringToSign = [method, contentType, ctime, path, ""].join("\n");
    const sig = this.sign(stringToSign, secret);

    return { sig, ctime, "x-version": xVersion };
  }
}
