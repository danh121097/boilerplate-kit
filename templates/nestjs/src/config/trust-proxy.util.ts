import { isIP } from "net";

/** Value accepted by Express `app.set("trust proxy", ...)`. */
export type TrustProxyValue = boolean | number | string;

const KEYWORDS = new Set(["loopback", "linklocal", "uniquelocal"]);

/** True for an IPv4/IPv6 address, optionally with a /prefix, or an Express keyword. */
function isValidEntry(entry: string): boolean {
  if (KEYWORDS.has(entry)) return true;
  const [addr, prefix, ...extra] = entry.split("/");
  const version = isIP(addr);
  if (version === 0 || extra.length > 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;
  return Number(prefix) <= (version === 4 ? 32 : 128);
}

/**
 * Parse TRUST_PROXY: `true`/`false`, a hop-count integer, or a comma-separated
 * list of IPs/subnets. Unset or blank → undefined (do not trust). Returns null
 * when the value is not one of those forms.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxyValue | undefined | null {
  const value = raw?.trim();
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  const entries = value.split(",").map((e) => e.trim());
  return entries.every(isValidEntry) ? entries.join(",") : null;
}
