# UI Components (`app/components/ui/`)

The component library follows the **shadcn-vue** pattern — CVA variants, the
`cn()` merge helper, and theme-token utilities — on top of **Reka UI** primitives.
Components are owned, in-repo source (not an external dependency), so you edit them
directly. This template does **not** ship a `components.json`; there is no
shadcn-vue CLI step.

## Nuxt Auto-Import

Nuxt auto-imports **every** `app/components/**` file with a path-derived prefix
(no `unplugin-vue-components`, no `components:` config in `nuxt.config.ts`):

- `app/components/ui/Button.vue` → `<UiButton>`
- `app/components/ui/Input.vue` → `<UiInput>`, etc.

`cn()` and other helpers under `app/utils/**` are auto-imported too, so SFCs call
`cn(...)` without importing it. Pinia stores stay **explicit** imports
(`storesDirs: []` in `nuxt.config.ts` disables store auto-import per project
convention).

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
- Loading shows a `LoaderCircle` spinner (`aria-hidden`) and blocks interaction.
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

`VeeInput.vue` wraps `<UiInput>` and binds it to a `vee-validate` field via
`useField(name)`. It surfaces the field's `errorMessage` and value, forwarding the
rest of `BaseInputProps`. Use `VeeInput` inside validated forms; use `Input` for
standalone controlled fields. The shared `BaseInputProps` interface keeps the two
prop surfaces in sync.

## Authoring Conventions

- Extract `interface Props` / `interface Emits` above `defineProps` — never inline.
- `<script setup>` order: imports → types → props/emits → composables → const →
  refs → computed → functions → lifecycle.
- Static variant sets → CVA in `*.variants.ts`; variants + behavior → typed maps
  in the SFC.
- Always merge the caller `class` last through `cn()`.
- New shared UI goes in `app/components/ui/`; feature-scoped components live
  elsewhere under `app/components/` (still auto-imported, with their own prefix).
