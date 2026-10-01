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
`ApiResponseError` objects, not `Error`s. A 2xx body carrying `success: false`
(the backend error envelope) is rejected as-is; envelopes are recognised only by
a boolean `success`.

## Model / service layer

Each `Model` method is a plain `async` function that propagates axios errors.
Consumers decide whether to catch or let React Query handle it:

```ts
// React Query captures thrown errors and puts them in `error`
const { data, error } = useUsersListQuery();
```

## Screen error boundaries

No global error boundary is wired by default. Add error handling at the screen
level (e.g., check `error` from React Query and render an error UI). For fatal
errors, catch in `useEffect` and navigate to an error screen.

## Form validation

`react-hook-form` (with `Controller`) + `zod` 4 + `@hookform/resolvers` handle
field-level errors. The login schema is `email` (`z.email`) + `password` (min 1: login
never judges strength, the server does); its messages are i18n keys (`validation.email`, `validation.password_required`) that the
screen translates when rendering the `Input` error. Validation runs on submit.

A failed login shows `getApiErrorMessage(err, t("login.error"))` (the server message,
else `login.error`) in a `Text` with `accessibilityRole="alert"`. While the request
is pending the submit button is disabled, shows its spinner and the
`login.submitting` label.

## Session and lookup errors

- Restoring the session failing transiently (offline, timeout, 5xx) shows the
  session-unavailable banner with a retry; a 401 goes through the normal logged-out
  flow (see [state-management](./state-management.md)).
- The users list shows `users.error` with the server message, and `users.empty`
  for an empty list.
- An unmatched route renders `app/+not-found.tsx` (`not_found.*` keys).

## Test environment

Jest-expo with `@testing-library/react-native` handles mocking. Token storage
tests mock `expo-secure-store` via `jest.mock`. Integration tests stub the
network adapter — no real HTTP. See [testing](../code-standards/testing.md).
