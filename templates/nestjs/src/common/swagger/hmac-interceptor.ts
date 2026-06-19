/**
 * Dev-only Swagger HMAC auto-signing.
 *
 * Every API route requires `sig` + `ctime` HMAC headers, so Swagger "Try it out"
 * would 401 without signing. In NON-production we inject:
 *   1. a tiny bootstrap script (buildHmacBootstrapJs) that puts the HMAC secret +
 *      apiPrefix on `window.__HMAC_CFG__`, and
 *   2. a Swagger `requestInterceptor` (hmacRequestInterceptor) that signs each
 *      outgoing request in the browser via Web Crypto and sets the headers.
 *
 * SECURITY: this embeds the HMAC secret into the /docs page — acceptable for local
 * dev only. NEVER enable in production (the caller gates both on !isProduction).
 *
 * The interceptor is serialized to the client via Function.prototype.toString(), so
 * it must NOT rely on closure variables — it reads everything from globalThis.
 */

/** Signs the request with HMAC-SHA256 and adds `sig`/`ctime` headers (runs in the browser). */
export const hmacRequestInterceptor = async (req: {
  url: string;
  method: string;
  headers: Record<string, string>;
}): Promise<unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = globalThis as any;
  const cfg = w.__HMAC_CFG__;
  if (!cfg) return req;

  // Path the server signs = apiPrefix-stripped, query-stripped (matches SecurityGuard.derivePath).
  let path = String(req.url)
    .replace(/^[a-z]+:\/\/[^/]+/i, "")
    .split("?")[0];
  if (cfg.apiPrefix && path.startsWith(cfg.apiPrefix)) {
    path = path.slice(cfg.apiPrefix.length) || "/";
  }

  const ctime = Date.now();
  // content-type = the exact header that will be sent (raw, or "" when absent) — matches the guard.
  const contentType = req.headers["Content-Type"] || req.headers["content-type"] || "";
  const stringToSign = [String(req.method).toUpperCase(), contentType, String(ctime), path, ""].join(
    "\n",
  );

  const enc = new w.TextEncoder();
  const key = await w.crypto.subtle.importKey(
    "raw",
    enc.encode(cfg.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await w.crypto.subtle.sign("HMAC", key, enc.encode(stringToSign));
  const bytes = new w.Uint8Array(sigBuf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);

  req.headers["sig"] = w.btoa(bin);
  req.headers["ctime"] = String(ctime);
  return req;
};

/**
 * JS that exposes the HMAC secret + apiPrefix to the interceptor (dev only).
 * Served as a SAME-ORIGIN external script (not inline) so helmet's CSP
 * `script-src 'self'` allows it — inline scripts are blocked by CSP.
 */
export function buildHmacBootstrapJs(secret: string, apiPrefix: string): string {
  return `window.__HMAC_CFG__ = ${JSON.stringify({ secret, apiPrefix })};`;
}
