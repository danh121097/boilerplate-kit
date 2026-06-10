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
- 401 handling: refresh + replay if eligible, else reload page

## Single-Flight Refresh

`RefreshTokenManager` ensures concurrent 401s trigger exactly one refresh
network call. All parallel requests await the same in-flight promise.

## Envelope Convention

The interceptor recognizes two envelope shapes:

```json
{ "status": "success", "data": {...} }
{ "success": true, "data": {...} }
```

Non-envelope responses (e.g. jsonplaceholder plain arrays) pass through as-is.
