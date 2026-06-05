# Vue + TypeScript

Patterns for `<script setup lang="ts">` SFCs, grounded in the real components
(`src/views/form-view.vue`, `src/components/ui/VeeInput.vue`).

## `<script setup>` section order

Order the contents of `<script setup>` consistently top-to-bottom:

1. **imports**
2. **types** (`interface Props` / `interface Emits` / local types)
3. **`defineProps` / `defineEmits`**
4. **composables** (`useI18n`, `useField`, store calls, custom `useXxx`)
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

## Explicit store imports

Pinia stores are **not** auto-imported. Import them explicitly even though Vue
core APIs (`ref`, `computed`, …) and `storeToRefs` are auto-imported.

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

`tsconfig.json` runs `strict: true` plus `noUncheckedIndexedAccess`,
`noFallthroughCasesInSwitch`, and `verbatimModuleSyntax`. Consequences:

- Type-only imports must use `import type { ... }` (verbatim module syntax).
- Indexed access yields `T | undefined` — guard before use.
- Type generics explicitly; let the service factories infer the rest:

```ts
const { errorMessage, value } = useField<string | number>(() => props.name);
export const useMeQuery = defineQuery<AuthUser>({ key: "auth.me", fetcher: () => AuthModel.getMe() });
```

Validate via `pnpm typecheck` (`vue-tsc --noEmit`) — it runs in `pnpm build` too.

## Template & i18n notes

- Auto-imported UI components (`Card`, `Button`, `Input`, `Badge`, `VeeInput`)
  need no import — only `src/components/ui/` is auto-registered.
- User-facing text goes through `useI18n()` → `t("...")`, not hardcoded strings.
