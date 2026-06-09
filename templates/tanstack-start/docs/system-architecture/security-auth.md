# Security + Auth

## Token storage model

| Token | Where stored | Who manages |
|-------|-------------|-------------|
| Access token (JWT) | `localStorage` via `STORAGE_KEYS.AUTH_TOKEN` | Client (`auth-token-storage.ts`) |
| Refresh token | httpOnly cookie | Server (set on login, rotated on refresh) |

The client never reads the refresh token. `withCredentials: true` on every axios
instance lets the browser attach the cookie automatically.

## HMAC request signing

Every request is signed when `VITE_HMAC_SECRET` is set.

Canonical string (identical to backend `verifyHmac`):
```
METHOD\n
Content-Type\n
ctime (ms epoch)\n
/path\n
(empty line)
```

Signed with HMAC-SHA256, Base64-encoded → `sig` header. Also sends `ctime` and
`x-version` headers. Implemented in `HMACSignatureGenerator.generateSignature()`.

The bare refresh client (`auth-refresh-client.ts`) signs its own request manually
(it bypasses the app interceptors to prevent refresh recursion).

## Single-flight refresh

`RefreshTokenManager` serializes concurrent 401 refreshes for ONE service:

```
concurrent 401s → getFreshToken() → inFlight promise already exists → join it
                                  → no inFlight → create one → persist new token
                                                              → clear inFlight
```

A burst of N concurrent 401s triggers exactly ONE `POST /auth/refresh`. All N
callers await the same promise and retry with the new token.

## Refresh eligibility

A 401 triggers an automatic refresh only when ALL are true:
1. `config._retry` is not set (not already retried).
2. URL does not include the refresh endpoint (not a recursive refresh).
3. A token exists for the service (not anonymous traffic).

## Logout

`AuthModel.logout()` calls `clearAuthTokens()` in a `finally` block so the
client token is always cleared even if the server request fails.
