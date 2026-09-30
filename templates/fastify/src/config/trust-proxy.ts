import { isIP } from "net";

/** Fastify 5 trustProxy value: boolean or an explicit address list. */
export type TrustProxySetting = boolean | string[];

const NAMED_RANGES = new Set(["loopback", "linklocal", "uniquelocal"]);

/** True for an IPv4/IPv6 address or CIDR subnet (`10.0.0.0/8`). */
function isAddressOrSubnet(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split("/");
  if (rest.length > 0 || !isIP(address)) return false;
  if (prefix === undefined) return true;
  const max = isIP(address) === 4 ? 32 : 128;
  return /^\d+$/.test(prefix) && Number(prefix) <= max;
}

/**
 * Parse the optional TRUST_PROXY env var. Unset/blank = undefined (do not trust
 * any proxy). Accepts `true`/`false` or a comma-separated list of IPs/subnets
 * (`loopback`/`linklocal`/`uniquelocal` also work). Hop-count trust is intentionally
 * unsupported because Fastify 5.12 disables it to prevent direct-client spoofing.
 * Anything else throws so a typo cannot silently trust or distrust the wrong hops.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  const entries = value.split(",").map((entry) => entry.trim());
  const valid = entries.every((entry) => NAMED_RANGES.has(entry) || isAddressOrSubnet(entry));
  if (!valid) {
    throw new Error(
      `Invalid TRUST_PROXY "${value}": use true, false, or a comma-separated list of IPs/subnets`,
    );
  }
  return entries;
}
