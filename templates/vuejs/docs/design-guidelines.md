# Design Guidelines

How the UI layer of this template is built: Tailwind v4, the `components/ui/`
component pattern (Reka UI based, shadcn-vue style), theming via CSS variables,
and a practical accessibility checklist.

This is a thin hub. Each topic lives in a focused, concrete file below.

| Doc | Covers |
| --- | --- |
| [tailwindcss.md](./design-guidelines/tailwindcss.md) | Tailwind v4 setup (Vite plugin, `tailwind.css`), `@theme` tokens, `@utility`, the `cn()` helper, utility conventions |
| [shadcn-vue-components.md](./design-guidelines/shadcn-vue-components.md) | The `components/ui/` pattern — how Badge / Button / Card / Input / VeeInput are structured (`*.variants.ts`, `*.props.ts`), auto-registration scope |
| [theming.md](./design-guidelines/theming.md) | Color tokens, light/dark mode, CSS variables as defined in `tailwind.css` + `main.scss` |
| [accessibility.md](./design-guidelines/accessibility.md) | Short, actionable a11y checklist grounded in what the UI components actually do |

## Source Of Truth

The docs describe what exists. The real definitions live in:

- `src/scss/tailwind.css` — Tailwind import, `@theme` tokens, `@utility`, dark-mode block
- `src/scss/main.scss` — global resets, font stack, safe-area + viewport vars
- `src/components/ui/` — the component library (auto-registered)
- `src/utils/cn.ts` — class-merge helper
- `components.json` — shadcn-vue config (style, base color, aliases)

## Conventions At A Glance

- **Style**: shadcn-vue `new-york`, base color `neutral`, CSS variables on (`components.json`).
- **Icons**: `lucide-vue-next`.
- **Class merging**: always compose classes through `cn()` so Tailwind conflicts dedupe.
- **Variants**: enumerated in a sibling `*.variants.ts` (CVA) or as typed maps in the SFC.
- **Auto-registration**: only `src/components/ui/` components are global; everything else is an explicit import.
