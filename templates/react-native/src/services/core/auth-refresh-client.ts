import { Api } from "@/services/core/api";
import { getRefreshToken } from "@/services/core/auth-token-storage";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import {
  isSessionRejectedStatus,
  RefreshRejectedError,
  RefreshUnavailableError,
} from "@/services/core/refresh-errors";
import type { RefreshedTokens } from "@/services/core/auth-token-storage";
import type { ApiService } from "@/services/core/types";
import type { InternalAxiosRequestConfig } from "axios";
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
 * guards the write with the session epoch). Failures are classified: 401/403 →
 * `RefreshRejectedError` (session over); anything else → `RefreshUnavailableError`
 * (transient — keep tokens, retry later). (`withCredentials` is kept so a backend that prefers an httpOnly
 * refresh cookie still works without code changes.)
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
  if (!token) throw new RefreshUnavailableError(0, "refresh_response_missing_access_token");
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
 * Map a refresh transport failure to the session policy: only a 401/403 answer
 * from the refresh endpoint ends the session.
 */
function classifyRefreshError(error: unknown): Error {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (isSessionRejectedStatus(status)) return new RefreshRejectedError(status!);
  const reason = axios.isAxiosError(error) ? (error.code ?? "refresh_failed") : "refresh_failed";
  return new RefreshUnavailableError(status ?? 0, reason);
}

/**
 * Build a refresher bound to a service + endpoint. Returns a thunk the
 * single-flight manager calls; it yields the freshly minted tokens without
 * persisting them.
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
    // The body is always sent (JSON), so the signature must cover
    // application/json — pass `data` so the signer sees a body.
    const body = { refreshToken: (await getRefreshToken(service)) ?? undefined };
    const signature = HMACSignatureGenerator.generateSignature({
      url: endpoint,
      method: "post",
      headers,
      data: body,
    } as unknown as InternalAxiosRequestConfig);
    if (signature) Object.assign(headers, signature);

    let data: RefreshResponseBody;
    try {
      ({ data } = await axios.post<RefreshResponseBody>(
        `${Api.getBaseURL(service)}${endpoint}`,
        body,
        { withCredentials: true, headers, timeout: REFRESH_TIMEOUT_MS },
      ));
    } catch (error) {
      throw classifyRefreshError(error);
    }

    return { accessToken: extractAccessToken(data), refreshToken: extractRefreshToken(data) };
  };
}
