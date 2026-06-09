# Networking

## Service Layer (Client-Side Only)

The axios service layer runs exclusively in the browser. Never call service
methods from React Server Components or server actions.

```
"use client" component / useEffect
  └── UsersModel.list()          ← service call
        └── Api instance (axios)
              ├── request interceptor: attach Bearer token + HMAC headers
              ├── POST to baseURL/path
              └── response interceptor: unwrap envelope / handle 401 → refresh
```

## Api Class

`Api` (src/services/core/api.ts) wraps axios with:
- Multi-service baseURL registry (`Api.setBaseURL`)
- Lazy interceptor attachment (applied on first request)
- Convenience methods: `get`, `post`, `put`, `patch`, `delete`, `postFormData`

## Interceptors

`ApiInterceptors` (src/services/core/interceptors.ts):

**Request:** attach `serviceType`, HMAC headers, Bearer token.

**Response:**
- Blob passthrough (for file downloads)
- Envelope unwrap: `{ status: "success"|"error" }` or `{ success: boolean }`
- 401 handling: refresh + replay if eligible, else clear token + reload

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
