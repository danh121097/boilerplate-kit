import { mockAuthAdapter } from "@/services/auth/mock-auth";
import { Api } from "@/services/core/api";
import { getRefreshToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { TokenRefresher } from "@/services/core/refresh-token-manager";
import type { ApiService } from "@/services/core/types";
import axios from "axios";

/**
 * Dedicated, interceptor-free call to the token-refresh endpoint.
 *
 * Kept on a bare axios instance — NOT the app client — so a 401 returned by the
 * refresh request itself can never recurse back into the refresh interceptor.
 *
 * The refresh token is read from localStorage and sent in the request body. The
 * backend rotates the pair and returns the new access (+ refresh) tokens, which
 * are handed to the refresh manager to persist.
 * (`withCredentials` is kept so a backend that prefers an httpOnly refresh cookie
 * still works without code changes.)
 */

/** A hung refresh must not stall every queued request forever. */
export const REFRESH_TIMEOUT_MS = 15_000;

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
  // No response status → not a refusal: the session is kept (see `isRefreshRefused`).
  if (!token) throw new Error("refresh_response_missing_access_token");
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
 * the rotated refresh token — the manager persists them, and only while the
 * session that asked is still current (logout may have run meanwhile).
 */
export function createTokenRefresher(endpoint: string, service: ApiService): TokenRefresher {
  return async () => {
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const body = { refreshToken: getRefreshToken(service) ?? undefined };
    // This bare client skips the app interceptors (to avoid refresh recursion),
    // so it must attach the same HMAC headers the backend requires of every
    // request — otherwise the refresh call itself is rejected. It always sends
    // a JSON body, so it signs that Content-Type. No-op when no secret is set.
    const signature = HMACSignatureGenerator.signRequest({
      method: "POST",
      path: endpoint,
      contentType: "application/json",
    });
    if (signature) Object.assign(headers, signature);

    // Axios errors are rethrown as-is: the manager classifies them.
    const { data } = await axios.post<RefreshResponseBody>(
      `${Api.getBaseURL(service)}${endpoint}`,
      body,
      {
        withCredentials: true,
        headers,
        timeout: REFRESH_TIMEOUT_MS,
        // Dev-only mock auth answers this call in the browser; undefined otherwise.
        adapter: mockAuthAdapter,
      },
    );

    return { accessToken: extractAccessToken(data), refreshToken: extractRefreshToken(data) };
  };
}
