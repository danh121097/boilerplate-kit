import type { FastifySwaggerUiConfigOptions } from "@fastify/swagger-ui";

interface HmacConfig {
  apiPrefix: string;
  secret: string;
}

type SwaggerRequest = Parameters<
  NonNullable<FastifySwaggerUiConfigOptions["requestInterceptor"]>
>[0];

type HmacGlobal = typeof globalThis & { __HMAC_CFG__?: HmacConfig };

/** Swagger UI signs API requests in the browser so users only enter Bearer tokens. */
export async function hmacRequestInterceptor(request: SwaggerRequest): Promise<SwaggerRequest> {
  let path = String(request.url)
    .replace(/^[a-z]+:\/\/[^/]+/i, "")
    .split("?")[0];
  if (path === "/docs" || path.startsWith("/docs/")) return request;

  const browser = globalThis as HmacGlobal;
  let config = browser.__HMAC_CFG__;
  if (!config) {
    try {
      const response = await fetch("/docs/hmac-config.js");
      if (!response.ok) return request;
      config = (await response.json()) as HmacConfig;
      browser.__HMAC_CFG__ = config;
    } catch {
      return request;
    }
  }

  if (path !== config.apiPrefix && !path.startsWith(`${config.apiPrefix}/`)) return request;
  path = path.slice(config.apiPrefix.length) || "/";

  const ctime = Date.now().toString();
  const contentType = request.headers["Content-Type"] || request.headers["content-type"] || "";
  const stringToSign = [request.method.toUpperCase(), contentType, ctime, path, ""].join("\n");
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(config.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(stringToSign));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  request.headers.sig = globalThis.btoa(binary);
  request.headers.ctime = ctime;
  return request;
}
