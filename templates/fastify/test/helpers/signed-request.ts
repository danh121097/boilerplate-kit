import { signHeaders } from "./sign-request";
import type { FastifyInstance, InjectOptions } from "fastify";

export const API = "/api/v1";

type SignedOptions = Omit<InjectOptions, "headers"> & { headers?: Record<string, string> };

/**
 * `app.inject` wrapper that adds the HMAC `sig`/`ctime` headers for an API URL
 * (path signed without the API prefix, like the frontend). Explicit `headers`
 * win over the generated ones, so a test can override or drop a signature.
 */
export function createSignedRequest(app: FastifyInstance) {
  return (options: SignedOptions) => {
    const path = (options.url as string).slice(API.length);
    const headers = {
      ...signHeaders(options.method as string, path, options.payload),
      ...options.headers,
    };
    return app.inject({ ...options, headers });
  };
}
