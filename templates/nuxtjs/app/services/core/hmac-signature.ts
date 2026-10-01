import { isMockAuthEnabled } from "@/services/auth/data/mock-auth-config";
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
 * looked up case-insensitively; undefined when none is pinned. */
function headerContentType(headers: unknown): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const h = headers as { get?: (name: string) => unknown } & Record<string, unknown>;
  const value =
    typeof h.get === "function"
      ? h.get("Content-Type")
      : Object.entries(h).find(([key]) => key.toLowerCase() === "content-type")?.[1];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * The Content-Type the request will actually send — the backend verifies the
 * raw header. axios drops Content-Type only when there is no body, so those
 * sign ""; a request with a body (even `null`) sends its pinned type exactly as
 * set, else axios's default for the body: `URLSearchParams` →
 * `application/x-www-form-urlencoded;charset=utf-8`, a string →
 * `application/x-www-form-urlencoded`, anything else → `application/json`.
 * Never pin a charset: browsers may rewrite it on the wire (Chrome sends
 * `charset=UTF-8`), breaking the comparison. Multipart is NOT supported: the
 * browser appends a boundary the signer cannot see.
 */
export function resolveContentType(config: InternalAxiosRequestConfig): string {
  if (config.data === undefined) return "";
  const pinned = headerContentType(config.headers);
  if (pinned) return pinned;
  if (typeof URLSearchParams !== "undefined" && config.data instanceof URLSearchParams) {
    return "application/x-www-form-urlencoded;charset=utf-8";
  }
  if (typeof config.data === "string") return "application/x-www-form-urlencoded";
  return "application/json";
}

let warnedEmptySecret = false;

/** Dev builds only, once: an empty secret with mock auth off means every request 401s. */
function warnEmptySecretOnce(): void {
  if (warnedEmptySecret || import.meta.env.PROD || isMockAuthEnabled()) return;
  warnedEmptySecret = true;
  console.warn("NUXT_PUBLIC_HMAC_SECRET is empty; the backend requires it, all requests will 401.");
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
    let inScope = false;

    try {
      const cfg = useRuntimeConfig() as unknown as {
        public?: { hmacSecret?: string; buildVersion?: string };
      };
      // Same public secret on server (SSR fetches) and client (axios, refresh).
      secret = cfg.public?.hmacSecret ?? "";
      xVersion = cfg.public?.buildVersion ?? "1.0.0";
      inScope = true;
    } catch {
      // Outside Nuxt request scope (e.g. pure unit test) — secret stays empty
    }

    if (!secret) {
      if (inScope) warnEmptySecretOnce();
      return null;
    }

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
   * after baseURL, without the API prefix) with the Content-Type the request
   * will send (see `resolveContentType`).
   */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType: resolveContentType(config),
    });
  }
}
