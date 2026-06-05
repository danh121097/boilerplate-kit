# Tailwind CSS (v4)

Tailwind v4 is wired through the Vite plugin — no `tailwind.config.js`. All
configuration (tokens, utilities, plugins) lives in CSS.

## Setup

- **Plugin**: `@tailwindcss/vite` is registered in `vite.config.ts` (`tailwindcss()`),
  so there is no PostCSS step and no JS config file (`components.json` → `tailwind.config` is `""`).
- **Entry**: `src/scss/tailwind.css` is the single Tailwind entry, imported once at app bootstrap.
- **Plugin import**: `@plugin "tailwindcss-animate";` (enables animation utilities).

```css
/* src/scss/tailwind.css */
@import "tailwindcss";
@plugin "tailwindcss-animate";
```

## Design Tokens — `@theme`

Tokens are declared in an `@theme inline` block in `tailwind.css`. Each
`--color-*` token becomes a usable Tailwind color utility (e.g. `bg-primary`,
`text-muted-foreground`, `border-input`). The dark variants live in a `.dark { … }`
block that overrides the same variables. See [theming.md](./theming.md) for the
full token list and dark-mode mechanics.

```css
@theme inline {
  --radius: 0.625rem;
  --color-background: hsl(0 0% 100%);
  --color-primary: hsl(0 0% 9%);
  --color-primary-foreground: hsl(0 0% 98%);
  /* …full list in theming.md */
}
```

Because tokens are HSL CSS variables, opacity modifiers work (`bg-primary/90`,
`bg-secondary/80`) — used directly in `Button.vue` for hover states.

## Custom Utilities — `@utility`

Reusable utilities are defined with Tailwind v4's `@utility` directive in
`tailwind.css` and consumed as normal classes:

| Utility | Effect |
| --- | --- |
| `flex-center` | `display:flex; justify-content:center; align-items:center` |
| `no-scrollbar` | Hides scrollbars (Firefox + WebKit) |
| `shimmer` | Animated skeleton gradient (paired with the `shimmer` keyframes) |

Keyframes (`shimmer`, `ripple`) are plain `@keyframes` in `tailwind.css`.

## Global Styles — `main.scss`

Non-Tailwind globals live in `src/scss/main.scss`:

- `box-sizing: border-box` reset on `*`.
- Body font stack (`Inter` first), antialiasing, `background`/`color` bound to
  `--color-background` / `--color-foreground`.
- Safe-area env vars (`--safe-area-*`) and a `--app-viewport-height` that falls
  back from `100dvh` to `100vh` via `@supports`.

## The `cn()` Helper

Compose classes through `cn()` (`src/utils/cn.ts`) — `clsx` for conditional
joining + `tailwind-merge` to dedupe conflicting Tailwind classes (last wins).

```ts
import { cn } from "@/utils/cn"; // also auto-imported from src/utils/**

cn("px-4 py-2", isActive && "bg-primary", props.class);
// later px-* / bg-* override earlier conflicting ones
```

Every UI component binds its root `:class` through `cn(...)` so a caller-passed
`class` prop can safely override internal classes.

## Conventions

- Prefer utility classes in templates; reach for `@utility` only when a pattern
  repeats across components.
- Never hardcode raw colors — use token utilities (`bg-card`, `text-destructive`)
  so light/dark and theming stay consistent.
- Always pass component-level overrides through `cn()`, never string concatenation.
- Keep one-off animations as scoped `<style>` keyframes (see `Button.vue` ripple);
  promote to `tailwind.css` only when shared.
