# Error Handling

## Network errors

`ApiInterceptors` response interceptor handles all non-2xx responses:

1. **401 with eligible request** — triggers refresh flow via `RefreshTokenManager`,
   then retries the original request once (`config._retry = true`).
2. **401 after retry / non-refresh 401** — rejects with the original error.
3. **Other errors** — reject with `toApiError(error)`: `{ error_code: <status,
   or 0 without a response>, message, retryable? }`.

The helpers live in `services/core/api-errors.ts`. Show a failed call's message
with `getApiErrorMessage(error, fallback)` — rejections are plain
`ApiResponseError` objects, not `Error`s.

## Model / service layer

Each `Model` method is a plain `async` function that propagates axios errors.
Consumers decide whether to catch or let React Query handle it:

```ts
// React Query captures thrown errors and puts them in `error`
const { data, error } = useUsersListQuery();
```

## Login and users errors

- Login shows `getApiErrorMessage(err, t("login.error"))` in a `role="alert"` paragraph;
  the submit button is disabled and reads `login.submitting` while pending.
- The users page shows `users.error` with the server's `error_message` (falling back to
  `message`), and `users.empty` when the list is empty.

## Session unavailable

A transient failure while restoring the session (network, timeout, 5xx) is not an
error page: the user stays signed in and the root layout shows the
`session.unavailable` banner with a retry button (see
[state-management](./state-management.md#session-state--auth-store)).

## Not found

The root route sets `notFoundComponent` (`components/not-found.tsx`), rendered inside the
layout for any unmatched URL: `not_found.title`, `not_found.description` and a
`not_found.back_home` link.

## Component error boundaries

No global error boundary is wired by default. Add React's `<ErrorBoundary>` from
`react-error-boundary` at the route level when needed.

## Form validation

`react-hook-form` + `zod` + `@hookform/resolvers` handle field-level errors.
Schemas carry i18n keys as messages (`loginSchema` in `services/auth/schema/login.ts`:
`validation.email`, `validation.password_min`); the page translates them with `t()`
before passing them to `FormField`, which renders the message inline below the input
and links it to the input with `aria-describedby`. Schema validation
runs on submit (or on change if `mode: "onChange"` is passed).

## Test environment

`installLocalStorage()` in `src/__tests__/helpers/fake-storage.ts` stubs
`globalThis.localStorage` via `vi.stubGlobal` for Vitest node environment.
Axios mock adapter (`axios-mock-adapter`) intercepts requests in integration
tests — no real HTTP. Both are cleaned up in `afterEach` / `afterAll`.
