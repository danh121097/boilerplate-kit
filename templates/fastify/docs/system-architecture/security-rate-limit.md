# Security and Rate Limits

Fastify plugins and route hooks implement the web boundary. Sources:
src/app.ts, src/plugins/security.ts, and src/modules/*/routes.ts.

## Fastify security plugins

- @fastify/helmet sets response security headers.
- @fastify/cors allows the configured local or production origins and supports
  credentialed cookie requests.
- @fastify/cookie parses request cookies and serializes response cookies. JWT
  signing and verification remain in the JWT utilities.
- @fastify/compress compresses eligible responses.
- @fastify/rate-limit enforces an API-wide 100 requests per minute. For each
  client, register, refresh, and logout share one 30-request/15-minute bucket;
  login uses a separate 30-request/15-minute bucket.
- app bodyLimit caps JSON request bodies at 100 KiB.

Redis is used as the distributed rate-limit store only when enabled; the
plugin is configured to fail open on store errors. With Redis disabled,
rate limiting uses the plugin's in-process store.

## Request protections

Root onRequest hooks check HMAC on every route under API_PREFIX, then apply the
optional CSRF origin check to mutating requests when ENABLE_CSRF=true. HMAC is
not authentication or body integrity: protected routes still require access
JWTs, and request bodies are not signed.

TRUST_PROXY is unset by default. Fastify 5.12 accepts true/false or explicit
IP/CIDR ranges. Hop-count-only trust is intentionally not supported because it
cannot establish that the immediate peer is trusted.

## Authentication and authorization

authenticate verifies RS256 access JWTs from the bearer header or accessToken
cookie and checks revocation state when Redis is enabled. requireMinRole runs
after authentication; /users requires at least admin. The check is server-side
and returns 401 when unauthenticated or 403 when the role is too low.

Refresh tokens are hashed in MongoDB, atomically rotated, and grouped by
session family. A short grace window permits parallel retries; later reuse
revokes the user's sessions. See [auth-jwt-refresh.md](./auth-jwt-refresh.md).
