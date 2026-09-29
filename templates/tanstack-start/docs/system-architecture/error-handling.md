# Error Handling

## Network errors

`ApiInterceptors` response interceptor handles all non-2xx responses:

1. **401 with eligible request** — triggers refresh flow via `RefreshTokenManager`,
   then retries the original request once (`config._retry = true`).
2. **401 after retry / non-refresh 401** — rejects with the original error.
3. **Other errors** — pass through `Promise.reject(error)` unchanged.

## Model / service layer

Each `Model` method is a plain `async` function that propagates axios errors.
Consumers decide whether to catch or let React Query handle it:

```ts
// React Query captures thrown errors and puts them in `error`
const { data, error } = useUsersListQuery();
```

## Session unavailable

Restoring the session (`useMeQuery`) can fail for a reason that says nothing about
the session: offline, timeout, 5xx, or a transient refresh failure. Those errors
carry `retryable: true` (`isSessionUnavailable(error)`, `services/auth/session.ts`).
The user keeps their current state and the root layout shows a banner
(`role="alert"`, `session.unavailable`) with a `session.retry` button that
refetches the session query; the banner disappears once it succeeds. A 401 or a
refused refresh is not this case: `fetchSession` resolves it to signed out, so no
banner shows and the normal logged-out flow runs.

## Not found

The root route sets `notFoundComponent` (`components/not-found.tsx`, keys
`not_found.title`, `not_found.description`, `not_found.back_home`), so an unmatched
URL renders inside the layout with a link home.

## Component error boundaries

No global error boundary is wired by default. Add React's `<ErrorBoundary>` from
`react-error-boundary` at the route level when needed.

## Form validation

`react-hook-form` + `zod` + `@hookform/resolvers` handle field-level errors.
`FormField` renders the error inline below the input. The login and demo forms
share `loginSchema` (`services/auth/login-schema.ts`): `email` must be a valid
email and `password` at least 8 characters. Schema messages are i18n keys
(`validation.email`, `validation.password_min`) translated where they render, and
forms use `noValidate` so the browser's native message never replaces them.
Validation runs on submit. A server failure on login is shown in a `role="alert"`
element as `getApiErrorMessage(error, t("login.error"))`.

## Test environment

`installLocalStorage()` in `src/__tests__/helpers/fake-storage.ts` stubs
`globalThis.localStorage` via `vi.stubGlobal` for Vitest node environment.
Axios mock adapter (`axios-mock-adapter`) intercepts requests in integration
tests — no real HTTP. Both are cleaned up in `afterEach` / `afterAll`.
