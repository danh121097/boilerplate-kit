# Security + Auth

## Token storage model

| Token | Where stored | Who manages |
|-------|-------------|-------------|
| Access token (JWT) | `expo-secure-store` (Keychain on iOS, Keystore on Android) | Client (`auth-token-storage.ts`) |
| Refresh token | `expo-secure-store` (same as above) | Client (rotated by backend on every refresh) |

**All token storage is async.** `SecureStore.getItemAsync()` returns a promise;
all reads and writes must await. Backend does not use httpOnly cookies in this
stack—tokens are stored securely on-device and sent as `Bearer` headers.

## HMAC request signing

Every request is signed when `EXPO_PUBLIC_HMAC_SECRET` is set.

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

## Hard logout (session expired)

When a refresh fails (e.g., refresh token expired), the response interceptor
calls the injected `onSessionExpired()` callback (registered in `initServices`).
This callback uses the router to navigate to `/(auth)/login`, clearing the current
stack. No `window.location.reload()`—Expo Router handles navigation natively.
