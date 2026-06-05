# Security & Auth

The flagship subsystem. Three layers protect every request: a **JWT access
token** (bearer, in localStorage), a **refresh token** (httpOnly cookie, owned by
the server), and an **HMAC signature** on every request. A 401 drives a
**single-flight** refresh-and-replay per service.

## Token Model

| Token | Where it lives | Set by | Read by JS? |
| --- | --- | --- | --- |
| Access (JWT) | `localStorage[<APP_PREFIX>_AUTH_TOKEN]` | client persists on login/refresh | yes (bearer header) |
| Refresh | httpOnly cookie | server (login + every rotation) | **no** — never readable from JS |

Per-service token storage (`auth-token-storage.ts`) keeps each backend's token in
its own slot, so multiple authenticated backends never collide:

```ts
const serviceTokenKeys = new Map([["MAIN", STORAGE_KEYS.AUTH_TOKEN]]);
getAuthToken(service)      // read one service's token (falls back to MAIN slot)
persistAuthToken(t, svc)   // write it
clearAuthToken(service)    // drop ONE service's token
clearAuthTokens()          // drop EVERY registered service's token (logout)
```

`AuthModel.logout()` calls `clearAuthTokens()` in a `finally`; a single failed
service's refresh only `clearAuthToken(service)`.

## HMAC Request Signing (`hmac-signature.ts`)

Active only when `VITE_HMAC_SECRET` is set; otherwise `generateSignature` returns
`null` and signing is skipped entirely.

```ts
const path = normalizeUrl(config.url || "");                 // ensure leading "/"
const method = config.method?.toUpperCase() || "";
const contentType = config.headers["Content-Type"] || "application/json";
const ctime = Date.now();
const stringToSign = [method, contentType, ctime, path, ""].join("\n");  // canonical
const sig = Base64.stringify(HmacSHA256(stringToSign, secret));          // base64 HMAC-SHA256
return { sig, ctime, "x-version": xVersion };                            // headers
```

- **Canonical string:** `[method, contentType, ctime, path, ""].join("\n")` — the
  trailing `""` yields a final newline.
- **Algorithm:** HMAC-SHA256, base64-encoded (`crypto-js`).
- **Headers attached:** `sig`, `ctime`, and `x-version` (`VITE_BUILD_VERSION` or
  `1.0.0`). The server recomputes the signature and compares.

Attached on the request interceptor via `HeadersUtils.setAuthHeaders`. The
Socket.IO handshake signs the same way over `GET /socket` (see
[Networking & Realtime](./networking-realtime.md)).

> Security note: a `VITE_*` secret is shipped to every browser. For production,
> sign server-side (BFF/proxy) and forward the headers — the client signer is for
> dev/template parity.

## The Refresh Flow

When a request returns 401, the response interceptor (`interceptors.ts`) tries to
recover before logging the user out.

### Eligibility — `canAttemptRefresh`

```ts
if (config._retry) return false;                          // already replayed once
if ((config.url ?? "").includes(options.endpoint)) return false; // the refresh call itself
return Boolean(getAuthToken(options.service));            // skip anonymous traffic
```

So: never loop (`_retry` guard), never refresh the refresh endpoint, never trigger
a refresh storm for anonymous requests (no token = no refresh).

### Single-Flight — `RefreshTokenManager` (`refresh-token-manager.ts`)

One manager per service. A burst of concurrent 401s triggers **exactly one**
network refresh — every caller awaits the same in-flight promise:

```ts
getFreshToken(): Promise<string> {
  if (this.inFlight) return this.inFlight;           // dedupe concurrent callers
  this.inFlight = this.refresh()
    .then((token) => { persistAuthToken(token, this.service); return token; })
    .catch((error) => { clearAuthToken(this.service); this.onRefreshFailed(); throw error; })
    .finally(() => { this.inFlight = null; });        // reset for the next burst
  return this.inFlight;
}
```

### The Refresh Call — `auth-refresh-client.ts`

Runs on a **bare axios instance**, NOT the app client, so a 401 from the refresh
request can never recurse back into the refresh interceptor. It must re-attach
HMAC headers itself (the bare client has no request interceptor):

```ts
const signature = HMACSignatureGenerator.generateSignature({ url: endpoint, method: "post", headers });
if (signature) Object.assign(headers, signature);
const { data } = await axios.post(`${Api.getBaseURL(service)}${endpoint}`, {}, { withCredentials: true, headers });
return extractAccessToken(data);   // tolerates several envelope shapes
```

`withCredentials: true` lets the browser attach the httpOnly refresh cookie; the
server rotates the pair and returns a new access token in the body. An empty `{}`
body (not `null`) is sent so axios keeps the signed `Content-Type`.

### Replay — `refreshAndRetry`

```ts
config._retry = true;                                  // mark before replaying
return ctx.manager.getFreshToken().then((token) => {
  config.headers.authorization = `Bearer ${token}`;
  return instance(config);                             // replay on the app client
});
```

The replay's own outcome propagates: a later non-auth failure (e.g. 500) does
**not** wrongly clear the freshly minted token.

### When Refresh Is Not Possible — `handleUnauthorized`

```ts
clearAuthToken(service);                  // drop only this service's token
if (!resolveRefresh(service)) reloadPage(); // reload only if service has NO refresh
```

A refresh-capable service handles its own reload via the manager's
`onRefreshFailed` hook (gated by `reloadOnFailure`, default `true`).

## Per-Service Refresh Config

`ApiInterceptors` is built from a `Record<service, ServiceRefreshConfig>`. A
service is auto-refreshed **iff it appears in that map**; omit it to opt out (its
401s just clear that service's token). Defaults: `endpoint: "/auth/refresh"`,
`reloadOnFailure: true`. Managers are built lazily and cached per service.

## End-to-End 401 Sequence

```
request → 401
   │
   ├─ canAttemptRefresh?  (not _retry, not the refresh URL, token present)
   │        │ no → clearAuthToken(service); reload if no refresh configured
   │        │ yes
   ├─ RefreshTokenManager.getFreshToken()   ← concurrent 401s share ONE call
   │        ├─ bare-axios POST /auth/refresh (cookie + HMAC) → new access token
   │        └─ persistAuthToken(newToken, service)
   ├─ config._retry = true
   └─ replay request with `Bearer <newToken>` → original outcome propagates
```
