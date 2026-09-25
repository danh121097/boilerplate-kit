# Networking

## Service Layer (Client-Side Only)

The axios service layer runs exclusively in the browser. Never call service
methods from React Server Components or server actions. For SSR data fetching,
use the server helpers in `src/server/` instead.

```
"use client" component / useEffect
  └── UsersModel.list()          ← service call
        └── Api instance (axios, withCredentials: true)
              ├── request interceptor: attach HMAC headers
              ├── GET/POST to baseURL/path (httpOnly cookies auto-sent)
              └── response interceptor: unwrap envelope / handle 401 → refresh
```

## Api Class

`Api` (src/services/core/api.ts) wraps axios with:

- Multi-service baseURL registry (`Api.setBaseURL`)
- `withCredentials: true` — httpOnly cookies auto-included
- Lazy interceptor attachment (applied on first request)
- Convenience methods: `get`, `post`, `put`, `patch`, `delete`, `paginate`, `cursorPaginate`

## Interceptors

`ApiInterceptors` (src/services/core/interceptors.ts):

**Request:** attach `serviceType` and HMAC headers (no Bearer — cookies are auto-sent).

**Response:**

- Blob passthrough (for file downloads)
- Envelope unwrap: `{ status: "success"|"error" }` or `{ success: boolean }`
- 401 handling: refresh + replay if eligible; otherwise reject with `error_code: 401`.
  Never reloads. Not eligible: the refresh/credential endpoints (`skipPaths` —
  login/register/logout), an already-replayed request, or no session hint
  (anonymous). A refused refresh (401/403) calls `endSession("expired")` and
  rejects with the original 401 (providers route to `/login`); a transient one
  (network, 15 s timeout, 429, 5xx) keeps the session and rejects with a
  `retryable: true` non-401 error. During a logout, a 401 rejects with
  `{ error_code: 401, message: "session_ended" }` without calling
  `/auth/refresh`.

## Single-Flight + Cross-Tab Refresh

`RefreshTokenManager` ensures concurrent 401s trigger exactly one refresh
network call. All parallel requests await the same in-flight promise. Across
tabs a Web Lock (`navigator.locks`, `${APP_PREFIX}:auth-refresh:<service>`) lets one tab
refresh at a time; a tab that waited skips its own refresh when the shared
`${APP_PREFIX}:auth-refresh:<service>:at` stamp shows another tab already rotated the
cookies. See [security-auth.md](./security-auth.md).

## Envelope Convention

The interceptor recognizes two envelope shapes:

```json
{ "status": "success", "data": {...} }
{ "success": true, "data": {...} }
```

Non-envelope responses (e.g. jsonplaceholder plain arrays) pass through as-is.
