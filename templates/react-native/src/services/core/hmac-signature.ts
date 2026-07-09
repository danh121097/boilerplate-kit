import type { HMACSignatureData } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

/**
 * HMAC signature generator for API request authentication.
 * Computes a signature header set; only active when `EXPO_PUBLIC_HMAC_SECRET` is set.
 *
 * The crypto-js signing logic is byte-for-byte identical to the web template
 * (crypto-js is pure JS and runs unchanged on React Native). Only the env source
 * differs: `EXPO_PUBLIC_*` instead of `import.meta.env.VITE_*`.
 *
 * SECURITY: an `EXPO_PUBLIC_*` var is inlined into the shipped bundle and thus
 * readable by anyone with the app. For a real deployment, sign on the server
 * (a BFF/proxy) and forward the headers rather than embedding the secret.
 */
export class HMACSignatureGenerator {
  private static normalizeUrl(url: string): string {
    return url.startsWith("/") ? url : `/${url}`;
  }

  private static sign(stringToSign: string, secret: string): string {
    return Base64.stringify(HmacSHA256(stringToSign, secret));
  }

  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    const secret = process.env.EXPO_PUBLIC_HMAC_SECRET;
    if (!secret) return null;

    const path = this.normalizeUrl(config.url || "");
    const method = config.method?.toUpperCase() || "";
    // Sign the content-type the request actually sends (the backend signs the raw
    // `Content-Type` header it receives). axios omits Content-Type on bodyless
    // requests (GET / DELETE with no data), so we sign "" for those — defaulting to
    // "application/json" here breaks the signature on GET.
    const pinned = config.headers?.["Content-Type"] as string | undefined;
    const isMultipart = typeof pinned === "string" && pinned.startsWith("multipart");
    const hasBody = config.data !== undefined && config.data !== null;
    const contentType = isMultipart ? pinned : hasBody ? "application/json" : "";
    const ctime = Date.now();
    const xVersion = process.env.EXPO_PUBLIC_BUILD_VERSION || "1.0.0";

    const stringToSign = [method, contentType, ctime, path, ""].join("\n");
    const sig = this.sign(stringToSign, secret);

    return { sig, ctime, "x-version": xVersion };
  }
}
