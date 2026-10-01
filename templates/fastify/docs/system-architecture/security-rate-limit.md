# Security and Rate Limits

Fastify plugins and route hooks implement the web boundary. Sources:
src/app.ts, src/plugins/{security,auth,role}.ts, and src/modules/*/routes.ts.

## Fastify security plugins

- @fastify/helmet sets response security headers.
- @fastify/cors allows the configured local or production origins and supports
  credentialed cookie requests.
- @fastify/cookie parses request cookies and serializes response cookies. JWT
  signing and verification remain in the JWT utilities.
- @fastify/compress compresses eligible responses.
- @fastify/rate-limit enforces an API-wide 100 requests per minute per client IP.
  Register, refresh, and logout share one 30-request/15-minute bucket (one
  encapsulated scope, one store); login uses a separate 30-request/15-minute
  bucket and does not consume the shared one. Auth requests also count against the
  global cap.
- app bodyLimit caps JSON request bodies at 100 KiB.

The limiters are `onRequest` hooks registered after the HMAC and CSRF hooks, so
they count every request that gets past those, before the body is parsed or the
JWT is checked. That includes validation failures, bad-JWT requests (for example
`GET /auth/me` with a bad token) and signed requests with a malformed or oversize
body. They do not count HMAC- or CSRF-rejected requests, and not signed unknown
paths: the 404 handler is not a route, so the global limiter never sees it
(Express counts those).

Redis is used as the distributed rate-limit store only when enabled; the
plugin is configured to fail open on store errors. With Redis disabled,
rate limiting uses the plugin's in-process store.

## Request protections

plugins/security.ts installs only the root onRequest hooks. They check HMAC on every route under API_PREFIX, then apply the
optional CSRF origin check to mutating requests when ENABLE_CSRF=true. A request
with none of Cookie, Origin or Referer (native apps, server-to-server) skips the
CSRF check: with no ambient credentials there is nothing to forge, and browsers
always send Origin on cross-site writes. A Cookie without Origin or Referer is
still rejected with 403.

HMAC is an anti-abuse layer, not authentication, body integrity or a security
boundary: a secret shipped to a browser or app is public, protected routes still
require access JWTs, and request bodies are not signed. Failures are 401 with
errorType HMAC_ERROR.

TRUST_PROXY is unset by default. Fastify 5.12 accepts true/false or explicit
IP/CIDR ranges. Hop-count-only trust is intentionally not supported because it
cannot establish that the immediate peer is trusted.

## Authentication and authorization

authenticate verifies RS256 access JWTs from the bearer header or accessToken
cookie and checks revocation state when Redis is enabled (src/plugins/auth.ts).
requireMinRole (src/plugins/role.ts) runs after authentication and compares
ROLE_RANK, defined once in src/types/auth.ts; /users requires at least admin. The check is server-side
and returns 401 when unauthenticated or 403 when the role is too low.

Refresh tokens are hashed in MongoDB, atomically rotated, and grouped by
session family. A short grace window permits parallel retries; later reuse of a
rotated token revokes every refresh token of the user. Logout deletes the
presented token's family instead. See [auth-jwt-refresh.md](./auth-jwt-refresh.md).
