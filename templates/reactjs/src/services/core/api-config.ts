/**
 * Backend origin shared by the HTTP client and the Socket.IO client, from
 * `VITE_APP_ENDPOINT` (default `http://localhost:3000`).
 */
export function getApiOrigin(): string {
  return import.meta.env.VITE_APP_ENDPOINT || "http://localhost:3000";
}

/**
 * HTTP API base URL = the backend origin + the versioned REST prefix, both from
 * env so a deployment can change them without code edits. `VITE_API_PREFIX`
 * defaults to `/api/v1` (mirrors the express `API_PREFIX`).
 */
export function getApiBaseUrl(): string {
  const prefix = import.meta.env.VITE_API_PREFIX || "/api/v1";
  return `${getApiOrigin()}${prefix}`;
}
