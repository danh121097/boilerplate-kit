# Design Guidelines

How the UI layer of this template is built: Tailwind v4, the `app/components/ui/`
component pattern (Reka UI based, shadcn-vue style), theming via CSS variables,
and a practical accessibility checklist.

This is a thin hub. Each topic lives in a focused, concrete file below.

| Doc | Covers |
| --- | --- |
| [tailwindcss.md](./design-guidelines/tailwindcss.md) | Tailwind v4 setup (Vite plugin in `nuxt.config.ts`, `app/css/main.css`), `@theme` tokens, `@utility`, the `cn()` helper, `main.scss` globals |
| [shadcn-vue-components.md](./design-guidelines/shadcn-vue-components.md) | The `app/components/ui/` pattern — how Badge / Button / Card / Input / VeeInput are structured (`*.variants.ts`, `*.props.ts`), Nuxt auto-import |
| [theming.md](./design-guidelines/theming.md) | Color tokens, light/dark mode, CSS variables as defined in `app/css/main.css` + `main.scss` |
| [accessibility.md](./design-guidelines/accessibility.md) | Short, actionable a11y checklist grounded in what the UI components actually do |

## Source Of Truth

The docs describe what exists. The real definitions live in:

- `app/css/main.css` — Tailwind import, `@theme inline` tokens, `@utility`, dark-mode `.dark` block, keyframes
- `app/css/main.scss` — global resets, safe-area vars, SCSS radius vars
- `app/components/ui/` — the component library (Nuxt auto-imported)
- `app/utils/cn.ts` — class-merge helper (Nuxt auto-imported)
- `nuxt.config.ts` — `@tailwindcss/vite` plugin, `css` registration, component/auto-import behavior

## Conventions At A Glance

- **No `components.json`** — this template does not use the shadcn-vue CLI. UI
  components are owned, in-repo source you edit directly; the shadcn-vue *pattern*
  (CVA variants, `cn()`, token utilities) is followed by hand.
- **Icons**: `lucide-vue-next`.
- **Class merging**: always compose classes through `cn()` so Tailwind conflicts dedupe.
- **Variants**: enumerated in a sibling `*.variants.ts` (CVA) or as typed maps in the SFC.
- **Auto-import**: Nuxt auto-imports every `app/components/**` file with a
  path-derived prefix (`app/components/ui/Button.vue` → `<UiButton>`); `cn()` and
  other `app/utils/**` helpers are auto-imported too. Pinia stores stay explicit.
