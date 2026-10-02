/** Build-time env access for the shared core services; the only file here that names env keys. */

/** Name of the client-readable HMAC secret variable, for diagnostics. */
export const HMAC_SECRET_ENV = "NEXT_PUBLIC_HMAC_SECRET";

/** Client-readable HMAC secret; empty or undefined disables request signing. */
export function getHmacSecret(): string | undefined {
  return process.env.NEXT_PUBLIC_HMAC_SECRET;
}

/** Build version sent as `x-version`, when configured. */
export function getBuildVersion(): string | undefined {
  return process.env.NEXT_PUBLIC_BUILD_VERSION;
}

/** True outside production builds. */
export function isDevBuild(): boolean {
  return process.env.NODE_ENV !== "production";
}
