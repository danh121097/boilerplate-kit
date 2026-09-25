# Error Handling

All HTTP error handling is centralized in the response interceptor
(`services/core/interceptors.ts`). Every failure resolves to a consistent
`ApiResponseError` shape, so callers (and TanStack Vue Query) handle one type.

## Error Shape (`types.ts`)

```ts
interface ApiResponseError {
  status: string;
  message: string;
  error_code: number;
  error_message: string;
  data?: Record<string, unknown>;
}
```

TanStack wrappers type their error channel as `ApiResponseError`, so
`query.error.value` / `mutation.error.value` are this shape.

## Envelope Detection

The interceptor unwraps API envelopes but must not mistake domain payloads for
them. `isEnvelope` recognizes an envelope **only** by a known marker:

```ts
function isEnvelope(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as EnvelopeBody;
  return b.status === "success" || b.status === "error" || typeof b.success === "boolean";
}
```

So `{ id: 1, status: "done" }` is treated as a raw payload, not an error envelope.
`onSuccess` then:

```ts
if (isEnvelope(response.data)) {
  const body = response.data;
  if (body.status === "success" || body.success === true) return response.data; // unwrap
  if (body.error_code === 401) { /* refresh-and-retry, else handleUnauthorized */ }
  return Promise.reject(response.data as ApiResponseError);   // envelope-level error
}
return response;   // non-envelope → pass through untouched
```

## The 401 Path

Two doors lead to the same recovery logic:

1. **HTTP 401** — caught in `onError` (`error.response?.status === 401`).
2. **Envelope-level 401** — `body.error_code === 401` inside a 2xx body.

Both call `refreshAndRetry`. If eligible (token present, not a credential call
such as login/refresh, not already replayed) the request is refreshed and
replayed; otherwise `handleUnauthorized` leaves credential calls alone (a login
401 is a wrong password) and otherwise clears that service's tokens, announcing
session expiry when a refresh-capable service held a session. The page is never
reloaded — the app routes to `/login`. Full mechanics:
[Security & Auth](./security-auth.md).

A key invariant: once a replay is launched, **its own** outcome propagates. A
post-refresh 500 is a genuine 500 — it is not re-interpreted as an auth failure
and does not clear the fresh token.

## Network Errors

Transport-level failures (no response) are detected by axios error codes:

```ts
if (error.code === "ERR_NETWORK" || error.code === "ERR_BLOCKED_BY_CLIENT") {
  console.error("Network error. Please check your internet connection.");
}
return Promise.reject(toApiError(error));
```

`ERR_BLOCKED_BY_CLIENT` covers ad-blockers / extensions cancelling the request.
`toApiError` (`api-errors.ts`) normalizes every rejection to `ApiResponseError`
with the HTTP status in `error_code` (`0` when there is no response), so callers
can tell a rejected session (`isUnauthorizedError` → 401) from an outage.

## Blob Errors

Binary downloads (`responseType: "blob"`) can't carry a JSON envelope, so they are
handled separately in `onSuccess` under `strictBlobError: true`:

```ts
if (response.data instanceof Blob) {
  if (!strictBlobError || (response.status >= 200 && response.status < 300)) {
    return response.data;                  // good download → return the blob
  }
  return Promise.reject<ApiResponseError>({ // non-2xx blob → synthetic error
    status: "error",
    error_code: response.status,
    error_message: response.statusText || "blob_error",
    message: response.statusText || "blob_error",
  });
}
```

This converts a failed binary response into the same `ApiResponseError` shape
every other error uses, instead of handing back an unreadable error blob.

## Summary

| Failure | Where | Result |
| --- | --- | --- |
| Envelope `status: "error"` | `onSuccess` | reject with the envelope as `ApiResponseError` |
| Envelope/HTTP 401 (eligible) | `onSuccess`/`onError` | refresh + replay |
| Envelope/HTTP 401 (credential call) | `handleUnauthorized` | reject as-is (no refresh, session kept) |
| Envelope/HTTP 401 (other, ineligible) | `handleUnauthorized` | clear service tokens; session-expired event if one was held |
| Refresh refused (401/403) | `RefreshTokenManager` | clear tokens; session-expired event → `/login`; reject 401 |
| Network / blocked | `onError` | log; reject `{ message, error_code: 0 }` |
| Non-2xx blob | `onSuccess` | reject synthetic `ApiResponseError` |
| Anything else | pass-through | raw response returned |
