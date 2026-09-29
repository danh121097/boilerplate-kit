# Naming Conventions

Symbol-level naming. For file names see [file-naming.md](./file-naming.md).

## Variables & functions — camelCase

Descriptive camelCase. Booleans read as predicates (`has*`, `is*`, `show*`).

```ts
const hasValidationError = computed(() => Boolean(errorMessage.value));
const showError = computed(() => hasValidationError.value || props.error);

function buildAuth() {
  return { role: "user", ...signHeader() };
}
```

Event handler functions are prefixed `handle*`; submit/action callbacks `on*`.

```ts
function handleConnectError(e: Error) { /* ... */ }
const onSubmit = handleSubmit(() => { success.value = true; });
```

## Types & interfaces — PascalCase

`interface` / `type` are PascalCase. No `I`-prefix. Domain types live next to
their consumer (`types/auth.ts`) or in a `*.props.ts` sibling.

```ts
export interface BaseInputProps { /* ... */ }
export type InputType = "text" | "password" | "email" | "number";
export interface QueryDefinition<TData, TParams = void> { /* ... */ }
```

Generic params use single-letter `T*` names: `TData`, `TParams`, `TVars`, `TCtx`.

## Composables — `useXxx`

A composable always starts with `use` and returns an object of refs/functions.
Files in `app/composables/**` are auto-imported by Nuxt.

```ts
export function useSocketIO() { /* ... */ return { socket, connectSocket }; }
export function useSocketEvent(event: string, cb: (...a: unknown[]) => void) {}
```

TanStack query/mutation factories follow the same `use*` shape so call sites read
like composables:

```ts
export const useLoginMutation = defineMutation<AuthResult, LoginPayload>({ /* ... */ });
export const useMeQuery = defineQuery<AuthUser | null>({ /* ... */ });
```

## Stores — `useXStore`

Pinia stores are named `useXStore` and live in `app/stores/<kebab-name>.ts`.
Always import them explicitly — this template disables Pinia auto-import
(`storesDirs: []` in `nuxt.config.ts`).

```ts
// store: app/stores/socket-io.ts  ->  export const useSocketIOStore = ...
import { useSocketIOStore } from "@/stores/socket-io";
const storeSocketIO = useSocketIOStore();
```

## Enums & constants — UPPER_SNAKE_CASE

Shared event names, messages, and keys are UPPER_SNAKE_CASE constants/enum
members, centralized in `app/enums/`.

```ts
import { SOCKET_EVENT } from "@/enums";
socket.on(SOCKET_EVENT.AUTHENTICATED, handleAuthenticated);
```

Storage keys go through the `useStorageKeys("LANGUAGE")` accessor so the
`runtimeConfig`-derived prefix is applied consistently.

## API fields — camelCase

Request payloads and response models use camelCase keys, matching the typed
contracts in `services/*/types/`.

```ts
const res = await this.api.post<AuthResult>({ url: authContract.paths.login, data: payload });
return res.data; // { user, tokens } — the tokens themselves live in httpOnly cookies
```

Query/mutation keys are dot-namespaced strings (`"auth.login"`, `"auth.me"`) so
related entries group and invalidate together.
