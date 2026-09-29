/**
 * Derive the path the client signed from the raw request URL.
 *
 * Nest setGlobalPrefix does NOT strip the API prefix from req.originalUrl in
 * a guard (unlike Express app.use(prefix, ...) which pre-strips it). We must
 * manually strip the prefix so the signed path matches what the client sends:
 *   req.originalUrl = "/api/v1/auth/login?foo=bar"  →  "/auth/login"
 *
 * Exported for unit testing.
 */
export function derivePath(originalUrl: string, apiPrefix: string): string {
  // Ensure prefix starts with "/" for consistent stripping.
  const prefix = apiPrefix.startsWith("/") ? apiPrefix : `/${apiPrefix}`;
  // Strip query string first, then strip the prefix.
  const withoutQuery = originalUrl.split("?")[0];
  if (withoutQuery.startsWith(prefix)) {
    const stripped = withoutQuery.slice(prefix.length);
    // Ensure result always starts with "/".
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }
  // Fallback: return as-is without query string.
  return withoutQuery;
}
