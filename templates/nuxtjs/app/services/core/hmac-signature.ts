import type { InternalAxiosRequestConfig } from "axios";
import type { HMACSignatureData } from "./types";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * HMAC signature generator for API request authentication.
 *
 * Active only when `runtimeConfig.hmacSecret` is set (private, server-only). For
 * truly secure HMAC the signing belongs in a Nitro server route — keeping it
 * here on the client is documentation-only and will return `null` unless the
 * secret is exposed (which you almost certainly should NOT do).
 */
export class HMACSignatureGenerator {
  private static normalizeUrl(url: string): string {
    return url.startsWith("/") ? url : `/${url}`;
  }

  private static sign(stringToSign: string, secret: string): string {
    return Base64.stringify(HmacSHA256(stringToSign, secret));
  }

  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    // Read secret lazily — `useRuntimeConfig` must be called inside a request scope.
    // Both keys are typed as `unknown` here so we don't depend on the runtimeConfig
    // schema declared in nuxt.config.ts. Cast on read.
    let secret = "";
    let xVersion = "1.0.0";
    try {
      const cfg = useRuntimeConfig() as unknown as {
        hmacSecret?: string;
        public?: { buildVersion?: string };
      };
      secret = cfg.hmacSecret ?? "";
      xVersion = cfg.public?.buildVersion ?? "1.0.0";
    } catch {
      return null;
    }
    if (!secret) return null;

    const path = this.normalizeUrl(config.url || "");
    const method = config.method?.toUpperCase() || "";
    const contentType = (config.headers["Content-Type"] as string) || "application/json";
    const ctime = Date.now();

    const stringToSign = [method, contentType, ctime, path, ""].join("\n");
    const sig = this.sign(stringToSign, secret);

    return { sig, ctime, "x-version": xVersion };
  }
}
