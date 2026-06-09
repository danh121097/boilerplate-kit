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

## Component error boundaries

No global error boundary is wired by default. Add React's `<ErrorBoundary>` from
`react-error-boundary` at the route level when needed.

## Form validation

`react-hook-form` + `zod` + `@hookform/resolvers` handle field-level errors.
`FormField` renders `error?.message` inline below the input. Schema validation
runs on submit (or on change if `mode: "onChange"` is passed).

## Test environment

`installLocalStorage()` in `src/__tests__/helpers/fake-storage.ts` stubs
`globalThis.localStorage` via `vi.stubGlobal` for Vitest node environment.
Axios mock adapter (`axios-mock-adapter`) intercepts requests in integration
tests — no real HTTP. Both are cleaned up in `afterEach` / `afterAll`.
