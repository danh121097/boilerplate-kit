# UI Components (`components/ui/`)

The component library follows the **shadcn-vue** pattern (config in
`components.json`: style `new-york`, base color `neutral`, `lucide` icons) on top
of **Reka UI** primitives. Components are owned, in-repo source — not an external
dependency — so you edit them directly.

## Auto-Registration Scope

`vite.config.ts` registers `unplugin-vue-components` with `dirs: ["./src/components/ui"]`.
**Only** `src/components/ui/` is globally auto-registered (types emitted to
`components.d.ts`). Feature components elsewhere stay explicit imports so the
global registry doesn't grow unbounded. Stores are likewise explicit imports.

`cn` and helpers under `src/utils/**` are auto-imported via `unplugin-auto-import`,
so SFCs can call `cn(...)` without importing it.

## File Layout Pattern

A component splits its concerns across up to three files:

| File | Role |
| --- | --- |
| `Xxx.vue` | SFC — template + behavior, root `:class` composed via `cn()` |
| `xxx.variants.ts` | CVA variant map + `VariantProps` type (when variants are static) |
| `xxx.props.ts` | Shared prop interface reused across related components |

Not every component needs all three — simple ones are a single SFC.

## Components

### Badge — CVA variants

`Badge.vue` is a thin `<span>` whose classes come from `badge.variants.ts`
(`class-variance-authority`):

```ts
// badge.variants.ts
export const badgeVariants = cva("inline-flex items-center rounded-full …", {
  variants: { variant: { default, secondary, success, warning, danger } },
  defaultVariants: { variant: "default" },
});
```

The SFC extracts `interface Props` (never inline), defaults `variant` via
`withDefaults`, and renders `cn(badgeVariants({ variant }), props.class)`.

### Button — typed variant maps + behavior

`Button.vue` keeps variants as typed `Record<>` maps in the SFC (not CVA) because
it also has behavior:

- Props: `variant` (primary | secondary | outline | ghost | danger | unstyled),
  `shape` (rounded | square | circle), `size` (sm | md | lg), `disabled`,
  `loading`, `block`, `type` (defaults to `"button"` to avoid accidental submits).
- `unstyled` renders a bare `<div>` wrapper instead of a `<button>`.
- Loading shows a `LoaderCircle` spinner and blocks interaction.
- A material-style **ripple** is created on click (cleaned up on `animationend`
  and `onBeforeUnmount`).
- All classes flow through a computed `cn(...)`.

### Card

`Card.vue` — minimal container: `rounded-lg border bg-white p-6 shadow-sm`,
overridable via `cn('…', props.class)`.

### Input — base input

`Input.vue` is the controlled base field (`v-model`). Props come from the shared
`BaseInputProps` in `input.props.ts` plus `modelValue` + `errorMessage`. Features:

- Floating label that lifts on focus or when a value exists.
- `variant`: `default` (outlined) | `filled`.
- Type-aware behavior: password show/hide toggle, search icon, `tel`/`number`
  input sanitizing + `inputmode="numeric"`, optional `clearable` (X) button.
- Digit `mask` support (`#` = digit; array of masks picks the shortest that fits).
- Error styling driven by the `error` boolean; `errorMessage` rendered below.

### VeeInput — vee-validate wrapper

`VeeInput.vue` wraps `Input` and binds it to a `vee-validate` field via
`useField(name)`. It surfaces the field's `errorMessage` and value, forwarding the
rest of `BaseInputProps`. Use `VeeInput` inside validated forms; use `Input` for
standalone controlled fields. The shared `BaseInputProps` interface is what keeps
the two prop surfaces in sync.

## Authoring Conventions

- Extract `interface Props` / `interface Emits` above `defineProps` — never inline.
- `<script setup>` order: imports → types → props/emits → composables → const →
  refs → computed → functions → lifecycle.
- Static variant sets → CVA in `*.variants.ts`; variants + behavior → typed maps
  in the SFC.
- Always merge the caller `class` last through `cn()`.
- New shared UI goes in `src/components/ui/`; feature-scoped components do not.
