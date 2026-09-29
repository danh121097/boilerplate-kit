import { mockAuthAdapter } from "@/services/auth/mock-auth";
import { Api } from "@/services/core/api";
import { getRefreshToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { TokenRefresher } from "@/services/core/refresh-token-manager";
import type { ApiService } from "@/services/core/types";
import axios from "axios";

/** Upper bound for the refresh round-trip; a hung refresh would otherwise stall
 * every request queued behind the single-flight promise. */
export const REFRESH_TIMEOUT_MS = 15_000;

/**
 * Dedicated, interceptor-free call to the token-refresh endpoint.
 *
 * Kept on a bare axios instance — NOT the app client — so a 401 returned by the
 * refresh request itself can never recurse back into the refresh interceptor.
 *
 * The refresh token is read from SecureStore (async) and sent in the request
 * body. The backend rotates the pair and returns the new access (+ refresh)
 * tokens, which are handed back to the single-flight manager to persist (it
 * guards the write with the session epoch). Failures are rethrown as the raw
 * axios error: the manager classifies them with `isRefreshRefused` (only 401/403
 * end the session). (`withCredentials` is kept so a backend that prefers an
 * httpOnly refresh cookie still works without code changes.)
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

/** A 200 without an access token is a contract bug, not a revoked session:
 * the error is not an HTTP 401/403, so the manager treats it as transient. */
function extractAccessToken(body: RefreshResponseBody | undefined): string {
  const token =
    body?.data?.tokens?.accessToken ??
    body?.data?.accessToken ??
    body?.tokens?.accessToken ??
    body?.accessToken;
  if (!token) throw new Error("refresh_response_missing_access_token");
  return token;
}

function extractRefreshToken(body: RefreshResponseBody | undefined): string | undefined {
  return (
    body?.data?.tokens?.refreshToken ??
    body?.data?.refreshToken ??
    body?.tokens?.refreshToken ??
    body?.refreshToken
  );
}

/**
 * Build a refresher bound to a service + endpoint. Returns a thunk the
 * single-flight manager calls; it yields the freshly minted tokens without
 * persisting them.
 */
export function createTokenRefresher(endpoint: string, service: ApiService): TokenRefresher {
  return async () => {
    const body = { refreshToken: (await getRefreshToken(service)) ?? undefined };
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    // This bare client skips the app interceptors (to avoid refresh recursion),
    // so it must attach the same HMAC headers the backend requires of every
    // request — otherwise the refresh call itself is rejected. It always sends a
    // JSON body, so it signs application/json. No-op without a secret.
    const signature = HMACSignatureGenerator.signRequest({
      method: "POST",
      path: endpoint,
      contentType: "application/json",
    });
    if (signature) Object.assign(headers, signature);

    const { data } = await axios.post<RefreshResponseBody>(
      `${Api.getBaseURL(service)}${endpoint}`,
      body,
      {
        withCredentials: true,
        headers,
        timeout: REFRESH_TIMEOUT_MS,
        // Dev-only mock auth answers this call in the app; undefined otherwise.
        adapter: mockAuthAdapter,
      },
    );
    return { accessToken: extractAccessToken(data), refreshToken: extractRefreshToken(data) };
  };
}
