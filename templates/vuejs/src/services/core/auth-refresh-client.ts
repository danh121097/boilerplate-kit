import { Api } from "@/services/core/api";
import { getRefreshToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { RefreshedTokens } from "@/services/core/refresh-token-manager";
import type { ApiService } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
import axios from "axios";

/**
 * Dedicated, interceptor-free call to the token-refresh endpoint.
 *
 * Kept on a bare axios instance — NOT the app client — so a 401 returned by the
 * refresh request itself can never recurse back into the refresh interceptor.
 *
 * The refresh token is read from localStorage and sent in the request body. The
 * backend rotates the pair and returns the new access (+ refresh) tokens, which
 * are handed to the single-flight manager — it persists them only if the session
 * was not cleared (logout) while the call was in flight.
 * (`withCredentials` is kept so a backend that prefers an httpOnly refresh cookie
 * still works without code changes.)
 */

/** Tolerates the common envelope shapes a backend may wrap the new tokens in. */
interface RefreshResponseBody {
  data?: {
    tokens?: { accessToken?: string; refreshToken?: string };
    accessToken?: string;
    refreshToken?: string;
  };
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

/** A refresh that takes longer is abandoned as a transient failure (the
 * session is kept; a later 401 refreshes again). */
export const REFRESH_TIMEOUT_MS = 15_000;

/**
 * Build a refresher bound to a service + endpoint. Returns a thunk the
 * single-flight manager calls; it yields the rotated pair (persisting is the
 * manager's job).
 */
export function createTokenRefresher(endpoint: string, service: ApiService) {
  return async (): Promise<RefreshedTokens> => {
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    // This bare client skips the app interceptors (to avoid refresh recursion),
    // so it must attach the same HMAC headers the backend requires of every
    // request — otherwise the refresh call itself is rejected. No-op when no
    // secret is configured.
    // The signer sees the same body + headers the request sends, so the signed
    // Content-Type ("application/json") matches the header the backend verifies.
    const body = { refreshToken: getRefreshToken(service) ?? undefined };
    const signature = HMACSignatureGenerator.generateSignature({
      url: endpoint,
      method: "post",
      headers,
      data: body,
    } as unknown as InternalAxiosRequestConfig);
    if (signature) Object.assign(headers, signature);

    const { data } = await axios.post<RefreshResponseBody>(
      `${Api.getBaseURL(service)}${endpoint}`,
      body,
      { withCredentials: true, headers, timeout: REFRESH_TIMEOUT_MS },
    );

    return { accessToken: extractAccessToken(data), refreshToken: extractRefreshToken(data) };
  };
}
