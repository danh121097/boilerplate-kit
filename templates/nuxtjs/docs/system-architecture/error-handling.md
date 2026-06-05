# Error Handling

All HTTP error handling is centralized in the response interceptor
(`app/services/core/interceptors.ts`). Every failure resolves to a consistent
`ApiResponseError` shape, so callers (and TanStack Vue Query) handle one type.
Recovery actions that touch the browser are **SSR-guarded**.

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
`query.error.value` / `mutation.error.value` are this shape (see
`app/pages/users.vue`, which reads `error.error_message || error.message`).

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

So `{ id: 1, status: "done" }` is treated as a raw payload, not an error
envelope. `onSuccess` then:

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

Both call `refreshAndRetry`. If eligible (token present, not the refresh call, not
already replayed) the request is refreshed and replayed; otherwise
`handleUnauthorized` clears that service's token and reloads only when the service
has no refresh configured. Full mechanics: [Security & Auth](./security-auth.md).

A key invariant: once a replay is launched, **its own** outcome propagates. A
post-refresh 500 is a genuine 500 — not re-interpreted as an auth failure, and it
does not clear the fresh token.

### SSR-guarded reload

During SSR every request is anonymous (no token), so 401 handling never reaches a
refresh. If a logout reload is requested, it no-ops on the server:

```ts
function reloadPage(): void {
  if (typeof window !== "undefined") window.location.reload();
}
```

So a 401 during Nitro render cannot crash rendering with an undefined `window`.

## Network Errors

Transport-level failures (no response) are detected by axios error codes:

```ts
if (error.code === "ERR_NETWORK" || error.code === "ERR_BLOCKED_BY_CLIENT") {
  console.error("Network error. Please check your internet connection.");
}
const errorData = error.response?.data ?? { message: error.message };
return Promise.reject(errorData as ApiResponseError);
```

`ERR_BLOCKED_BY_CLIENT` covers ad-blockers / extensions cancelling the request.
With no response body, the rejection falls back to `{ message: error.message }`.

## Blob Errors

Binary downloads (`responseType: "blob"`) can't carry a JSON envelope, so they
are handled separately in `onSuccess` under `strictBlobError: true`:

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
every other error uses, instead of an unreadable error blob.

## Summary

| Failure | Where | Result |
| --- | --- | --- |
| Envelope `status: "error"` | `onSuccess` | reject with the envelope as `ApiResponseError` |
| Envelope/HTTP 401 (eligible) | `onSuccess`/`onError` | refresh + replay |
| Envelope/HTTP 401 (ineligible, incl. all SSR) | `handleUnauthorized` | clear service token; reload if no refresh (SSR-guarded) |
| Network / blocked | `onError` | log; reject `{ message }` |
| Non-2xx blob | `onSuccess` | reject synthetic `ApiResponseError` |
| Anything else | pass-through | raw response returned |
