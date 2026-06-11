/**
 * HTTP API base URL = the backend endpoint + the versioned REST prefix, both from
 * runtimeConfig (`NUXT_PUBLIC_APP_ENDPOINT` / `NUXT_PUBLIC_API_PREFIX`) so a
 * deployment can change them without code edits. `appEndpoint` is the origin
 * (also used bare by the Socket.IO client); `apiPrefix` defaults to `/api/v1`
 * (mirrors the express `API_PREFIX`). Reads runtimeConfig, so call inside a Nuxt
 * request scope (plugin / setup / server handler).
 */
export function getApiBaseUrl(): string {
  const { appEndpoint, apiPrefix } = useRuntimeConfig().public;
  return `${appEndpoint || "http://localhost:3000"}${apiPrefix || "/api/v1"}`;
}
