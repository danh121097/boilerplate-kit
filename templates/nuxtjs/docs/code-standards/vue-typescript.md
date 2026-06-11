# Vue + TypeScript

Patterns for `<script setup lang="ts">` SFCs in a Nuxt SSR app, grounded in the
real code (`app/pages/form.vue`, `app/components/ui/VeeInput.vue`,
`app/composables/useSocketIO.ts`).

## `<script setup>` section order

Order the contents of `<script setup>` consistently top-to-bottom:

1. **imports**
2. **types** (`interface Props` / `interface Emits` / local types)
3. **`defineProps` / `defineEmits`**
4. **composables** (`useI18n`, `useField`, `useRuntimeConfig`, store calls, custom `useXxx`)
5. **const** (plain values, schemas)
6. **destructuring** (from composable returns)
7. **let**
8. **ref** / `useTemplateRef`
9. **computed**
10. **functions**
11. **lifecycle** (`onMounted`, `onScopeDispose`, …)

Example (`VeeInput.vue`):

```ts
import { useField } from "vee-validate";          // 1 imports
import type { BaseInputProps } from "./input.props";

interface Props extends BaseInputProps {          // 2 types
  /** Field name — must match the form schema key. */
  name: string;
}

const props = withDefaults(defineProps<Props>(), { type: "text", variant: "default" }); // 3 props

const { errorMessage, value } = useField<string | number>(() => props.name, undefined, { // 4 composable + 6 destructure
  validateOnValueUpdate: true,
});

const hasValidationError = computed(() => Boolean(errorMessage.value)); // 9 computed
const showError = computed(() => hasValidationError.value || props.error);
```

## Props & Emits — extract the interface

Always declare a named `interface Props` / `interface Emits` above the macro.
**Never inline** the type literal into `defineProps` / `defineEmits`.

```ts
// Good
interface Props { name: string; disabled?: boolean }
const props = withDefaults(defineProps<Props>(), { disabled: false });

interface Emits { (e: "submit", value: string): void }
const emit = defineEmits<Emits>();

// Avoid — inline type literal
const props = defineProps<{ name: string; disabled?: boolean }>();
```

Shared prop surfaces live in a sibling `*.props.ts` and are extended:
`interface Props extends BaseInputProps { name: string }` (see `input.props.ts`).

## SSR-safe patterns

Code runs on the Nitro server first, then hydrates on the client. Two rules keep
SFCs and the composables they call SSR-safe.

### Guard browser-only access with `isClient`

Never touch `window`, `document`, or `localStorage` at module scope or during
setup without a client guard. The token storage shows the pattern — server reads
no-op and return `null`:

```ts
function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getAuthToken(service = "MAIN"): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(resolveTokenKey(service));
}
```

Run handshake / connection side effects in `onMounted` (client-only), not at
setup top-level — see `useSocketIO()` (`onMounted(connectSocket)`).

### Read config via `useRuntimeConfig`, never `import.meta.env`

Public config comes from `runtimeConfig.public` (declared in `nuxt.config.ts`).
Call `useRuntimeConfig()` inside a request scope (setup / composable / plugin) —
do not read it at module top-level.

```ts
const runtime = useRuntimeConfig();
const URL = runtime.public.appEndpoint || "";
const HMAC_SECRET = runtime.public.hmacSecret || "";
```

Secrets that must stay server-side go in the **private** `runtimeConfig` (not
`.public`) so they never ship to the browser bundle.

## Explicit store imports

Pinia stores are **not** auto-imported in this template (`storesDirs: []`).
Import them explicitly even though Vue core APIs (`ref`, `computed`, …),
`storeToRefs`, and `useRuntimeConfig` are auto-imported.

```ts
import { useSocketIOStore } from "@/stores/socket-io";
const storeSocketIO = useSocketIOStore();
const { ioStore } = storeToRefs(storeSocketIO);
```

## Template refs — `useTemplateRef`

Prefer `useTemplateRef("name")` over a manually-typed `ref(null)` bound by name.

```ts
const inputEl = useTemplateRef<HTMLInputElement>("inputEl");
// <input ref="inputEl" />
```

## Strict TypeScript

`nuxt.config.ts` sets `typescript.strict: true`; the generated
`.nuxt/tsconfig.json` (extended by the root `tsconfig.json`) applies the strict
flag set. Consequences:

- Type-only imports must use `import type { ... }`.
- Indexed access can yield `T | undefined` — guard before use.
- Type generics explicitly; let the service factories infer the rest:

```ts
const { errorMessage, value } = useField<string | number>(() => props.name);
export const useSessionQuery = defineQuery<AuthUser | null>({ key: "auth.me", fetcher: () => serverApiGet(authContract.paths.me) });
```

Validate via `pnpm typecheck` (`nuxt typecheck`).

## Template & i18n notes

- Auto-imported components carry their path prefix: `<UiCard>`, `<UiButton>`,
  `<UiVeeInput>` for files under `app/components/ui/`. No import needed.
- User-facing text goes through `useI18n()` → `t("...")`, not hardcoded strings.
