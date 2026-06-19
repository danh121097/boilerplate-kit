import { Api } from "@/services/core/api";
import { HMACSignatureGenerator } from "@/services/core/hmac-signature";
import type { ApiService } from "@/services/core/types";
import axios from "axios";

/**
 * Build a refresher bound to a service + endpoint, for the single-flight manager.
 * Runs on a bare axios instance (NOT the app client) so a 401 from the refresh
 * call can't recurse into the refresh interceptor. Cookie-based: the browser sends
 * the httpOnly refresh cookie, the backend rotates both cookies, the caller replays
 * its request — no token touches JS. Client-only (called from the interceptor).
 */
export function createTokenRefresher(endpoint: string, service: ApiService) {
  return async (): Promise<void> => {
    const headers: Record<string, string | number> = { Accept: "application/json" };
    // The bare client skips app interceptors, so it must attach HMAC itself or the
    // refresh is rejected. Body less request → no Content-Type → sign "" to match
    // what the backend verifies. `endpoint` is the path after baseURL (no prefix).
    const signature = HMACSignatureGenerator.signRequest({
      method: "POST",
      path: endpoint,
      contentType: "",
    });
    if (signature) Object.assign(headers, signature);

    // Empty body — the httpOnly refresh cookie carries the credential.
    await axios.post(`${Api.getBaseURL(service)}${endpoint}`, undefined, {
      withCredentials: true,
      headers,
    });
  };
}
