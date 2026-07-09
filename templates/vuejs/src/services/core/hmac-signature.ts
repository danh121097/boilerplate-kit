import type { HMACSignatureData } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * HMAC signature generator for API request authentication.
 * Computes a signature header set; only active when VITE_HMAC_SECRET is set.
 */
export class HMACSignatureGenerator {
  private static normalizeUrl(url: string): string {
    return url.startsWith("/") ? url : `/${url}`;
  }

  private static sign(stringToSign: string, secret: string): string {
    return Base64.stringify(HmacSHA256(stringToSign, secret));
  }

  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    const secret = import.meta.env.VITE_HMAC_SECRET;
    if (!secret) return null;

    const path = this.normalizeUrl(config.url || "");
    const method = config.method?.toUpperCase() || "";
    const pinned = config.headers?.["Content-Type"] as string | undefined;
    const isMultipart = typeof pinned === "string" && pinned.startsWith("multipart");
    const hasBody = config.data !== undefined && config.data !== null;
    const contentType = isMultipart ? pinned : hasBody ? "application/json" : "";
    const ctime = Date.now();
    const xVersion = import.meta.env.VITE_BUILD_VERSION || "1.0.0";

    const stringToSign = [method, contentType, ctime, path, ""].join("\n");
    const sig = this.sign(stringToSign, secret);

    return { sig, ctime, "x-version": xVersion };
  }
}
