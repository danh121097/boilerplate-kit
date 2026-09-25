import type { HMACSignatureData } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * HMAC signature generator for API request authentication.
 * Computes a signature header set; only active when VITE_HMAC_SECRET is set.
 */
export class HMACSignatureGenerator {
  /** The path the server verifies: leading "/", no `?query` / `#hash` (the
   * backends sign `req.url` / `originalUrl` with the query stripped). */
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
    // Sign the Content-Type the request will actually send — the backend verifies
    // the raw header. axios drops Content-Type on bodyless requests, so those sign
    // ""; a request with a body sends its pinned type (default application/json).
    // A pinned value is signed exactly as sent — never pin a charset: browsers
    // may rewrite it on the wire (Chrome sends `charset=UTF-8`), breaking the
    // raw-header comparison. Multipart is NOT supported: the browser appends a
    // boundary the signer cannot see.
    const headers = config.headers as Record<string, unknown> | undefined;
    const pinned = headers?.["Content-Type"] ?? headers?.["content-type"];
    const hasBody = config.data !== undefined && config.data !== null;
    const contentType = hasBody ? (typeof pinned === "string" && pinned) || "application/json" : "";
    const ctime = Date.now();
    const xVersion = import.meta.env.VITE_BUILD_VERSION || "1.0.0";

    const stringToSign = [method, contentType, ctime, path, ""].join("\n");
    const sig = this.sign(stringToSign, secret);

    return { sig, ctime, "x-version": xVersion };
  }
}
