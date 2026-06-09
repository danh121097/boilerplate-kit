import { Api } from "./api";
import { getRefreshToken, persistRefreshToken } from "./auth-token-storage";
import { HMACSignatureGenerator } from "./hmac-signature";
import type { ApiService } from "./types";
import type { InternalAxiosRequestConfig } from "axios";
import axios from "axios";

/**
 * Dedicated, interceptor-free call to the token-refresh endpoint.
 *
 * Kept on a bare axios instance — NOT the app client — so a 401 returned by the
 * refresh request itself can never recurse back into the refresh interceptor.
 *
 * The refresh token is read from localStorage and sent in the request body. The
 * backend rotates the pair and returns the new access (+ refresh) tokens; the new
 * refresh token is persisted here and the access token is handed to the caller.
 * (`withCredentials` is kept so a backend that prefers an httpOnly refresh cookie
 * still works without code changes.)
 *
 * SSR note: this function is only called from the response interceptor which only
 * fires on the client (axios requests from components/hooks). It is never called
 * during SSR server function execution.
 */

/** Tolerates the common envelope shapes a backend may wrap the new tokens in. */
interface RefreshResponseBody {
  data?: { tokens?: { accessToken?: string; refreshToken?: string }; accessToken?: string; refreshToken?: string };
  tokens?: { accessToken?: string; refreshToken?: string };
  accessToken?: string;
  refreshToken?: string;
}

function extractAccessToken(body: RefreshResponseBody): string {
  const token =
    body.data?.tokens?.accessToken ??
    body.data?.accessToken ??
    body.tokens?.accessToken ??
    body.accessToken;
  if (!token) throw new Error("Refresh response did not contain an access token");
  return token;
}

function extractRefreshToken(body: RefreshResponseBody): string | undefined {
  return (
    body.data?.tokens?.refreshToken ??
    body.data?.refreshToken ??
    body.tokens?.refreshToken ??
    body.refreshToken
  );
}

/**
 * Build a refresher bound to a service + endpoint. Returns a thunk the
 * single-flight manager calls; it yields the freshly minted access token and
 * persists the rotated refresh token as a side effect.
 */
export function createTokenRefresher(endpoint: string, service: ApiService) {
  return async (): Promise<string> => {
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    // This bare client skips the app interceptors (to avoid refresh recursion),
    // so it must attach the same HMAC headers the backend requires of every
    // request — otherwise the refresh call itself is rejected. No-op when no
    // secret is configured.
    const signature = HMACSignatureGenerator.generateSignature({
      url: endpoint,
      method: "post",
      headers,
    } as unknown as InternalAxiosRequestConfig);
    if (signature) Object.assign(headers, signature);

    const { data } = await axios.post<RefreshResponseBody>(
      `${Api.getBaseURL(service)}${endpoint}`,
      { refreshToken: getRefreshToken(service) ?? undefined },
      { withCredentials: true, headers },
    );

    const rotated = extractRefreshToken(data);
    if (rotated) persistRefreshToken(rotated, service);
    return extractAccessToken(data);
  };
}
