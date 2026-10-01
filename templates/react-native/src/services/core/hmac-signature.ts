import { getMockAuth } from "@/services/auth/data/mock-auth-config";
import type { HMACSignatureData } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
import Base64 from "crypto-js/enc-base64";
import HmacSHA256 from "crypto-js/hmac-sha256";

export interface SignRequestInput {
  method: string;
  /** Request path relative to the baseURL; any `?query` / `#hash` is stripped. */
  path: string;
  /** The exact Content-Type header that will be sent ("" without a body).
   * Defaults to `application/json`; pass it explicitly (`resolveContentType`). */
  contentType?: string;
  ctime?: number;
}

/** Case-insensitive Content-Type lookup on AxiosHeaders and plain objects alike. */
function headerContentType(config: InternalAxiosRequestConfig): string | undefined {
  let value: unknown;

  const headers = config.headers as unknown as
    (Record<string, unknown> & { get?: (name: string) => unknown }) | undefined;
  if (typeof headers?.get === "function") {
    value = headers.get("Content-Type");
  } else if (headers) {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === "content-type");
    value = key ? headers[key] : undefined;
  }
  return typeof value === "string" && value ? value : undefined;
}

/**
 * The Content-Type axios will actually send for `config` — the value the
 * backend reads and verifies:
 * - no body (`data === undefined`): axios drops the header → "";
 * - a pinned Content-Type (instance default or per request): sent as is;
 * - otherwise axios' own default for the body: URLSearchParams →
 *   `application/x-www-form-urlencoded;charset=utf-8`, a string →
 *   `application/x-www-form-urlencoded`, anything else (incl. `null`) →
 *   `application/json`.
 *
 * Multipart is not supported with HMAC on: the runtime appends a boundary the
 * signer cannot see.
 */
export function resolveContentType(config: InternalAxiosRequestConfig): string {
  if (config.data === undefined) return "";
  const pinned = headerContentType(config);
  if (pinned) return pinned;
  if (config.data instanceof URLSearchParams) {
    return "application/x-www-form-urlencoded;charset=utf-8";
  }
  if (typeof config.data === "string") return "application/x-www-form-urlencoded";
  return "application/json";
}

let warnedEmptySecret = false;

/** Dev builds only, once per launch: the backend requires the signature, so an
 * empty secret (with the mock off) means every request will 401. Never logs the secret. */
function warnEmptySecret(): void {
  if (warnedEmptySecret || !__DEV__ || getMockAuth()) return;
  warnedEmptySecret = true;
  console.warn("EXPO_PUBLIC_HMAC_SECRET is empty; the backend requires it, all requests will 401.");
}

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
  /** The path the server verifies: leading "/", no `?query` / `#hash` (the
   * backend signs the request path with the query stripped). */
  private static normalizeUrl(url: string): string {
    const path = url.split(/[?#]/)[0] ?? "";
    return path.startsWith("/") ? path : `/${path}`;
  }

  private static sign(stringToSign: string, secret: string): string {
    return Base64.stringify(HmacSHA256(stringToSign, secret));
  }

  /** Pure signer: `[METHOD, contentType, ctime, path, ""]` joined by newlines.
   * Returns null when no secret is configured. */
  static signRequest({
    method,
    path,
    contentType = "application/json",
    ctime = Date.now(),
  }: SignRequestInput): HMACSignatureData | null {
    const secret = process.env.EXPO_PUBLIC_HMAC_SECRET;
    if (!secret) {
      warnEmptySecret();
      return null;
    }

    const xVersion = process.env.EXPO_PUBLIC_BUILD_VERSION || "1.0.0";
    const stringToSign = [
      method.toUpperCase(),
      contentType,
      ctime,
      this.normalizeUrl(path),
      "",
    ].join("\n");

    return { sig: this.sign(stringToSign, secret), ctime, "x-version": xVersion };
  }

  /** Adapter for the request interceptor: signs `config.url` (the path after
   * baseURL; `params` are never part of it) with the Content-Type axios sends. */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType: resolveContentType(config),
    });
  }
}
