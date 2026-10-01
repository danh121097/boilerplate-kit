/**
 * Backend origin shared by the HTTP client and the Socket.IO client, from
 * `EXPO_PUBLIC_APP_ENDPOINT` (default `http://localhost:3000`). Android emulators
 * reach the host at `http://10.0.2.2:3000`; a device needs the host's LAN IP.
 *
 * Expo inlines `EXPO_PUBLIC_*` into the bundle at build time; under jest they are
 * plain `process.env` reads, so this works in both environments.
 */
export function getApiOrigin(): string {
  return process.env.EXPO_PUBLIC_APP_ENDPOINT || "http://localhost:3000";
}

/**
 * HTTP API base URL = the backend origin + the versioned REST prefix, both from
 * env so a deployment can change them without code edits. `EXPO_PUBLIC_API_PREFIX`
 * defaults to `/api/v1` (mirrors the express `API_PREFIX`).
 */
export function getApiBaseUrl(): string {
  const prefix = process.env.EXPO_PUBLIC_API_PREFIX || "/api/v1";
  return `${getApiOrigin()}${prefix}`;
}
