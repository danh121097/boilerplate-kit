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
them. `isEnvelope` recognizes an envelope **only** by a boolean `success`, the marker
every backend success and error body carries:

```ts
function isEnvelope(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as EnvelopeBody;
  return typeof b.success === "boolean";
}
```

So `{ id: 1, status: "done" }` is treated as a raw payload, not an error envelope.
`onSuccess` then:

```ts
if (isEnvelope(response.data)) {
  const body = response.data;
  if (body.success === true) return response.data; // unwrap
  if (body.error_code === 401) { /* refresh-and-retry when eligible */ }
  return Promise.reject(response.data as ApiResponseError);   // envelope-level error
}
return response;   // non-envelope → pass through untouched
```

## The 401 Path

Two doors lead to the same recovery logic:

1. **HTTP 401** — caught in `onError` (`error.response?.status === 401`).
2. **Envelope-level 401** — `body.error_code === 401` inside a 2xx body.

Both call `refreshAndRetry`. If eligible (a session is stored, not the refresh
endpoint or a `skipPaths` entry such as login, not already replayed) the request
is refreshed and replayed; otherwise the 401 rejects as-is and nothing is
cleared (a login 401 is a wrong password). Only the refresh call decides that a
session is gone: a refused refresh (401/403) ends it as `"expired"` and the app
routes to `/login`; any other refresh failure rejects with a retryable
`refresh_unavailable` error and keeps it. The page is never reloaded. Full
mechanics: [Security & Auth](./security-auth.md).

A key invariant: once a replay is launched, **its own** outcome propagates. A
post-refresh 500 is a genuine 500, and a post-refresh 401 just rejects to the
caller — neither clears the fresh token nor ends the session.

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
| Envelope/HTTP 401 (ineligible: credential call, anonymous, replayed, no refresh config) | `onSuccess`/`onError` | reject as-is (no refresh, session kept) |
| Refresh refused (401/403) | `RefreshTokenManager` | clear tokens; `endSession("expired")` → `/login`; reject the original 401 |
| Refresh failed otherwise (network, timeout, 400, 408, 429, 5xx, malformed body) | `refreshAndRetry` | reject `refreshUnavailable` (`retryable: true`); session kept |
| Network / blocked | `onError` | log; reject `{ message, error_code: 0 }` |
| Non-2xx blob | `onSuccess` | reject synthetic `ApiResponseError` |
| Anything else | pass-through | raw response returned |

## Not-Found and Page-Level Errors

- Unknown URLs match the router catch-all `/:pathMatch(.*)*` and render
  `views/not-found-view.vue` (`not_found.title`, `not_found.description`,
  `not_found.back_home`), instead of a blank view.
- The login form shows the server message via
  `getApiErrorMessage(err, t("login.error"))` in a `role="alert"` element.
- The users page shows `t("users.error", { message })` on failure and
  `users.empty` when the list is empty.
