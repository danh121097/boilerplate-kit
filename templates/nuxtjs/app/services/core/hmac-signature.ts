import type { InternalAxiosRequestConfig } from "axios";
import type { HMACSignatureData } from "./types";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * HMAC signature generator for API request authentication.
 *
 * Active only when `runtimeConfig.public.hmacSecret` is set. Note the secret is
 * client-readable (public), mirroring the Vue template's behavior. For a
 * stronger guarantee, move signing into a Nitro server route and keep the secret
 * private (`runtimeConfig.hmacSecret`) so it never reaches the browser.
 */
export class HMACSignatureGenerator {
  private static normalizeUrl(url: string): string {
    return url.startsWith("/") ? url : `/${url}`;
  }

  private static sign(stringToSign: string, secret: string): string {
    return Base64.stringify(HmacSHA256(stringToSign, secret));
  }

  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    // Read config lazily — `useRuntimeConfig` must be called inside a request scope.
    // Keys live under `public` (client-readable) and are typed as `unknown` here so
    // we don't depend on the runtimeConfig schema declared in nuxt.config.ts.
    let secret = "";
    let xVersion = "1.0.0";
    try {
      const cfg = useRuntimeConfig() as unknown as {
        public?: { hmacSecret?: string; buildVersion?: string };
      };
      secret = cfg.public?.hmacSecret ?? "";
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
