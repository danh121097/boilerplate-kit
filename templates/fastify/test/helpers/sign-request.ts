import { createHmac } from "node:crypto";

const HMAC_SECRET = "test-hmac-secret-key-for-testing-min32chars";

export function signHeaders(
  method: string,
  path: string,
  payload?: unknown,
): Record<string, string> {
  const ctime = Date.now().toString();
  const contentType = payload === undefined ? "" : "application/json";
  const canonical = [method.toUpperCase(), contentType, ctime, path.split("?", 1)[0], ""].join(
    "\n",
  );
  const sig = createHmac("sha256", HMAC_SECRET).update(canonical).digest("base64");
  return { sig, ctime, ...(contentType && { "content-type": contentType }) };
}
