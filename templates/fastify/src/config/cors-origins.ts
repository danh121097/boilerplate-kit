const DEV_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:9000",
  "http://localhost:4321",
];

/**
 * Non-production origin list: `raw` (the comma-separated CORS_ORIGINS value) when it
 * lists anything, else the default dev ports. Each entry must be a bare origin
 * (`scheme://host[:port]`, no path or trailing slash) so it can match a browser's
 * `Origin` header exactly.
 */
export function parseDevCorsOrigins(raw: string | undefined): string[] {
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return DEV_CORS_ORIGINS;
  for (const entry of entries) {
    let origin: string | undefined;
    try {
      origin = new URL(entry).origin;
    } catch {
      origin = undefined;
    }
    if (origin !== entry) {
      throw new Error(`CORS_ORIGINS entries must be origins like http://localhost:5173: ${entry}`);
    }
  }
  return entries;
}
