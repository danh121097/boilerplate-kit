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

type HeaderBag = Record<string, unknown> & { get?: (name: string) => unknown };

/** The Content-Type pinned on the request (instance default or per request):
 * `AxiosHeaders.get` when available, else a case-insensitive key scan. */
function headerContentType(config: InternalAxiosRequestConfig): string | undefined {
  const headers = config.headers as unknown as HeaderBag | undefined;
  if (!headers) return undefined;
  const raw =
    typeof headers.get === "function"
      ? headers.get("Content-Type")
      : Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1];
  return typeof raw === "string" && raw ? raw : undefined;
}

/**
 * The Content-Type axios will send, which is what the backend verifies: ""
 * when there is no body (axios drops the header only for `data === undefined`),
 * else the pinned value exactly as set, else axios's own default for the body —
 * form-urlencoded (with charset) for `URLSearchParams`, form-urlencoded for a
 * string, JSON otherwise (`null` included: axios sends it as a JSON body).
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

/**
 * HMAC signature generator for API request authentication. Only active when
 * `VITE_HMAC_SECRET` is set. `signRequest` is the pure core (the bare refresh
 * client uses it directly); `generateSignature` adapts an axios request config.
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

  /** Pure signer. Returns null when no secret is configured. */
  static signRequest({
    method,
    path,
    contentType = "application/json",
    ctime = Date.now(),
  }: SignRequestInput): HMACSignatureData | null {
    const secret = import.meta.env.VITE_HMAC_SECRET;
    if (!secret) return null;

    const xVersion = import.meta.env.VITE_BUILD_VERSION || "1.0.0";
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
   * the baseURL) with the Content-Type the request will actually send. */
  static generateSignature(config: InternalAxiosRequestConfig): HMACSignatureData | null {
    return this.signRequest({
      method: config.method || "",
      path: config.url || "",
      contentType: resolveContentType(config),
    });
  }
}
