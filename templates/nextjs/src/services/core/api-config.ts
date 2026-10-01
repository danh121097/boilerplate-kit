/** Backend origin shared by the HTTP client and the Socket.IO client. */
export function getApiOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_ENDPOINT || "http://localhost:3000";
}

/**
 * HTTP API base URL = the backend endpoint + the versioned REST prefix, both from
 * env so a deployment can change them without code edits (used by the client axios
 * layer AND server fetches). `NEXT_PUBLIC_APP_ENDPOINT` is the origin (also used
 * bare by the Socket.IO client via `getApiOrigin`); `NEXT_PUBLIC_API_PREFIX` defaults to `/api/v1`
 * (mirrors the express `API_PREFIX`).
 */
export function getApiBaseUrl(): string {
  const endpoint = getApiOrigin();
  const prefix = process.env.NEXT_PUBLIC_API_PREFIX || "/api/v1";
  return `${endpoint}${prefix}`;
}
