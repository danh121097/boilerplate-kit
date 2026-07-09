/**
 * HTTP API base URL = the backend endpoint + the versioned REST prefix, both from
 * env so a deployment can change them without code edits. `EXPO_PUBLIC_APP_ENDPOINT`
 * is the origin (also used bare by the Socket.IO client); `EXPO_PUBLIC_API_PREFIX`
 * defaults to `/api/v1` (mirrors the express `API_PREFIX`).
 *
 * Expo inlines `EXPO_PUBLIC_*` into the bundle at build time; under jest they are
 * plain `process.env` reads, so this works in both environments.
 */
export function getApiBaseUrl(): string {
  const endpoint = process.env.EXPO_PUBLIC_APP_ENDPOINT || "http://localhost:3000";
  const prefix = process.env.EXPO_PUBLIC_API_PREFIX || "/api/v1";
  return `${endpoint}${prefix}`;
}
