# Error Handling

## Network errors

The `ApiInterceptors` response interceptor handles every non-2xx response:

1. **401 on an eligible request** — refresh through `RefreshTokenManager`, then
   replay the original request once.
2. **401 after the replay / not eligible** (login, register, logout, an
   anonymous visitor with no session hint) — reject with `error_code: 401`. The
   page never reloads.
3. **Refused refresh** (401/403 from `/auth/refresh`) — the session is over:
   `endSession("expired")`, and `Providers` routes to `/login?redirect=…`.
4. **`HMAC_ERROR`** (401 with `errorType: "HMAC_ERROR"`: wrong secret or clock
   skew over 5 minutes) — never refreshed; the session is kept and the error is
   `retryable: true`. A refresh call rejected this way is also kept
   (`refreshHmacRejected`), not treated as revoked. A dev build warns once when
   the secret is empty.
5. **Transient failure** (offline, timeout, 408, 429, 5xx, or a refresh that
   failed transiently) — reject with `retryable: true`. The session is kept.
6. **Anything else** — reject with `toApiError(error)`.

Rejections are plain `ApiResponseError` objects (`{ status, message,
error_message, error_code, retryable? }`), not `Error`s. `error_code` carries the
HTTP status (`0` without a response). The helpers live in
`services/core/api-errors.ts`; show a failed call's message with
`getApiErrorMessage(error, fallback)` (the login page does:
`getApiErrorMessage(err, t("login.error"))`).

## Server reads

`server/server-api.ts` follows the same shape: every failure **rejects** with an
`ApiResponseError` (401 for a missing or expired access cookie, `0` when the
backend is unreachable, `retryable` on 0/408/429/5xx and on `HMAC_ERROR`, which keeps its
`errorType`; logged once per process) and never resolves to an
empty value. A rejecting prefetch is not dehydrated, so the client query fetches
on mount through axios, which can refresh. See
[security-auth.md](./security-auth.md#ssr-data-fetching).

## Session unavailable

Restoring the session (`useMeQuery` → `AuthModel.getSession`) has three outcomes:

| Outcome                                  | Result                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| no session hint (anonymous)              | resolves `null` with no request: no banner              |
| success                                  | signed in                                               |
| 401 or 404 (`isSessionGoneError`)        | resolves `null`: normal signed-out flow, no banner      |
| transient (network, timeout, 5xx)        | query error with `retryable: true`: **banner + Retry**  |
| `HMAC_ERROR` (browser or SSR read)       | session kept, no refresh, `retryable: true`: **banner + Retry** |

A 404 signs out because the bundled backends answer a deleted user and an unknown
route with the same `NOT_FOUND`; a misrouted API prefix or gateway 404 therefore
signs the user out too.

`useAuth()` exposes `sessionUnavailable` (`isSessionUnavailable(error)`) and
`retrySession()`. The root layout renders `<SessionAlert />` above the page
content: an `role="alert"` banner reading `session.unavailable` with a
`session.retry` button that re-runs the restore. The banner disappears when the
retry succeeds. The user's current state is kept meanwhile — a transient failure
never logs anyone out.

## Not found

`src/app/not-found.tsx` renders inside the root layout for any unmatched URL and
for `notFound()`: `not_found.title`, `not_found.description` and a
`not_found.back_home` link to `/`, all localized. There is no custom
`error.tsx` / global error boundary; add one at the segment level when a page
needs its own fallback.

## Query errors in pages

React Query puts a rejection in `error`. The users page shows
`t("users.error", { message: error.error_message || error.message })`, an
empty list shows `users.empty`, and both replace the list rather than rendering
alongside it.

## Form validation

`react-hook-form` + `zod` (v4) + `@hookform/resolvers` handle field errors. Schema
messages are i18n keys (`validation.email`, `validation.password_required`); pages
translate them at render (`t(errors.email.message)`) and `FormField` prints the
result under the input. The login form has `noValidate`, so zod (not the
browser's native tooltip) owns the messages.

## Test environment

Vitest runs in the `node` environment with no DOM. Components are covered by
server-rendering them (`renderToString`) with the i18n helper in
`src/__tests__/helpers/render-with-i18n.ts`; session behavior is covered with a
`QueryObserver` over the real service functions.
