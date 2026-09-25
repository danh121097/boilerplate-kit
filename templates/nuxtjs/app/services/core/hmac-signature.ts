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
 * secret lives under `runtimeConfig.public.hmacSecret` because the browser must
 * sign too — so it is readable by anyone: an anti-casual-abuse layer matching
 * the backend's HMAC_SECRET, not authentication. Keep it `public`; a private-only
 * secret would leave the browser unable to sign.
 *
 * `signRequest` is the pure core, reused by the axios interceptor AND `serverApiGet`
 * so a forwarded SSR fetch carries the same headers the backend
 * requires. The axios adapter (`generateSignature`) derives content-type from the
 * request config and delegates here.
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
      };
      // Same public secret on server (SSR fetches) and client (axios, refresh).
      secret = cfg.public?.hmacSecret ?? "";
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
   * so we sign "" for those; a request with a body sends the type it pins
   * (e.g. `text/plain`, `application/x-www-form-urlencoded`), defaulting to
   * "application/json". A pinned value is signed exactly as sent — never pin a
   * charset: browsers may rewrite it on the wire (Chrome sends `charset=UTF-8`),
   * breaking the raw-header comparison. Multipart is NOT supported: the browser
   * appends a boundary the signer cannot see.
   */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    const headers = config.headers as Record<string, unknown> | undefined;
    const pinned = headers?.["Content-Type"] ?? headers?.["content-type"];
    const hasBody = config.data !== undefined && config.data !== null;
    const contentType = hasBody ? (typeof pinned === "string" && pinned) || "application/json" : "";

    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType,
    });
  }
}
