import { Api } from "./api";
import { HMACSignatureGenerator } from "./hmac-signature";
import type { ApiService } from "./types";
import axios from "axios";

/**
 * Dedicated, interceptor-free call to the token-refresh endpoint.
 *
 * Kept on a bare axios instance — NOT the app client — so a 401 returned by the
 * refresh request itself can never recurse back into the refresh interceptor.
 *
 * Auth is cookie-based: the browser sends the httpOnly refresh cookie
 * automatically (`withCredentials`), the backend rotates BOTH token cookies via
 * Set-Cookie, and the caller simply replays its original request. No token is
 * read from or written to JS — the refresher resolves with no value.
 *
 * SSR note: this function is only called from the response interceptor which only
 * fires on the client (axios requests from components/hooks). It is never called
 * during SSR server function execution.
 */

/**
 * Build a refresher bound to a service + endpoint. Returns a thunk the
 * single-flight manager calls; it POSTs to the refresh endpoint and resolves
 * once the backend has rotated the auth cookies.
 */
export function createTokenRefresher(endpoint: string, service: ApiService) {
  return async (): Promise<void> => {
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    // This bare client skips the app interceptors (to avoid refresh recursion),
    // so it must attach the same HMAC headers the backend requires of every
    // request — otherwise the refresh call itself is rejected. No-op when no
    // secret is configured. `endpoint` is the path after baseURL (no API prefix),
    // matching what the backend signs.
    const signature = HMACSignatureGenerator.signRequest({
      method: "POST",
      path: endpoint,
      contentType: "application/json",
    });
    if (signature) Object.assign(headers, signature);

    // Empty body — the httpOnly refresh cookie carries the credential.
    await axios.post(`${Api.getBaseURL(service)}${endpoint}`, undefined, {
      withCredentials: true,
      headers,
    });
  };
}
