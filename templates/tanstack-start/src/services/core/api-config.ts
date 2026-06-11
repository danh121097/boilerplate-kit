/**
 * HTTP API base URL = the backend endpoint + the versioned REST prefix, both from
 * env so a deployment can change them without code edits (used by SSR fetches AND
 * the client). `VITE_APP_ENDPOINT` is the origin (also used bare by the Socket.IO
 * client); `VITE_API_PREFIX` defaults to `/api/v1` (mirrors the express `API_PREFIX`).
 */
export function getApiBaseUrl(): string {
  const endpoint = import.meta.env.VITE_APP_ENDPOINT || "http://localhost:3000";
  const prefix = import.meta.env.VITE_API_PREFIX || "/api/v1";
  return `${endpoint}${prefix}`;
}
