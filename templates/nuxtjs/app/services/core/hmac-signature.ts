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
 * HMAC request signer — active only when the HMAC secret is configured. The
 * secret lives under `runtimeConfig.public.hmacSecret` (client-readable, a soft
 * integrity layer matching the backend's HMAC_SECRET).
 *
 * `signRequest` is the pure core, reused by the axios interceptor AND `serverApiGet`
 * so a forwarded SSR fetch carries the same headers the backend
 * requires. The axios adapter (`generateSignature`) derives content-type from the
 * request config and delegates here.
 */
export class HMACSignatureGenerator {
  private static normalizeUrl(url: string): string {
    return url.startsWith("/") ? url : `/${url}`;
  }

  private static sign(stringToSign: string, secret: string): string {
    return Base64.stringify(HmacSHA256(stringToSign, secret));
  }

  /**
   * Pure signer — reads the secret from `useRuntimeConfig().public.hmacSecret`
   * (auto-imported in both the client and SSR server contexts). Returns null
   * when no secret is configured.
   */
  static signRequest({
    method,
    path,
    contentType = "application/json",
    ctime = Date.now(),
  }: SignRequestInput): HMACSignatureData | null {
    let secret = "";
    let xVersion = "1.0.0";

    try {
      const cfg = useRuntimeConfig() as unknown as {
        public?: { hmacSecret?: string; buildVersion?: string };
        hmacSecret?: string;
      };
      // Prefer private runtimeConfig (server-only) then public (client-readable)
      secret = cfg.hmacSecret ?? cfg.public?.hmacSecret ?? "";
      xVersion = cfg.public?.buildVersion ?? "1.0.0";
    } catch {
      // Outside Nuxt request scope (e.g. pure unit test) — secret stays empty
    }

    if (!secret) return null;

    const stringToSign = [
      method.toUpperCase(),
      contentType,
      ctime,
      this.normalizeUrl(path),
      "",
    ].join("\n");

    return { sig: this.sign(stringToSign, secret), ctime, "x-version": xVersion };
  }

  /**
   * Adapter for the axios interceptor — signs `config.url` (already the path
   * after baseURL, without the API prefix).
   *
   * The signed content-type MUST equal what the request actually sends:
   * axios omits Content-Type on body less requests (GET / DELETE with no data),
   * so we sign "" for those and "application/json" only when a body is present.
   * Multipart form-data requests keep their own pinned content-type.
   */
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
