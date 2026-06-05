import { Api } from "./api";
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
 * The refresh token lives in an httpOnly cookie the browser sets on login; it is
 * never readable from JS. `withCredentials` lets the browser attach that cookie,
 * the backend rotates the pair, and the new access token comes back in the body
 * for us to persist as the Bearer token.
 */

/** Tolerates the common envelope shapes a backend may wrap the new token in. */
interface RefreshResponseBody {
  data?: { tokens?: { accessToken?: string }; accessToken?: string };
  tokens?: { accessToken?: string };
  accessToken?: string;
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

/**
 * Build a refresher bound to a service + endpoint. Returns a thunk the
 * single-flight manager calls; it yields the freshly minted access token.
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

    // Send an empty object (not null) so axios keeps the Content-Type header we
    // signed; the refresh token travels in the cookie, the body is unused.
    const { data } = await axios.post<RefreshResponseBody>(
      `${Api.getBaseURL(service)}${endpoint}`,
      {},
      { withCredentials: true, headers },
    );
    return extractAccessToken(data);
  };
}
