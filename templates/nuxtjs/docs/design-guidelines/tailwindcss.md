# Tailwind CSS (v4)

Tailwind v4 is wired through the Vite plugin — no `tailwind.config.js`. All
configuration (tokens, utilities, plugins) lives in CSS.

## Setup

- **Plugin**: `@tailwindcss/vite` is registered in `nuxt.config.ts` under
  `vite.plugins` (`tailwindcss()`), so there is no PostCSS step and no JS config file.
- **Entry**: `app/css/main.css` is the Tailwind entry. It is registered in
  `nuxt.config.ts` via `css: ["@/css/main.css", "@/css/main.scss"]`, so Nuxt loads
  it globally at app bootstrap.
- **Plugin import**: `@plugin "tailwindcss-animate";` (enables animation utilities).

```css
/* app/css/main.css */
@import "tailwindcss";
@plugin "tailwindcss-animate";
```

## Design Tokens — `@theme`

Tokens are declared in an `@theme inline` block in `main.css`. Each `--color-*`
token becomes a usable Tailwind color utility (e.g. `bg-primary`,
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
`main.css` and consumed as normal classes:

| Utility | Effect |
| --- | --- |
| `flex-center` | `display:flex; justify-content:center; align-items:center` |
| `no-scrollbar` | Hides scrollbars (Firefox + WebKit) |
| `shimmer` | Animated skeleton gradient (paired with the `shimmer` keyframes) |

Keyframes (`shimmer`, `ripple`) are plain `@keyframes` in `main.css`.

## Global Styles — `main.scss`

Non-Tailwind globals live in `app/css/main.scss` (loaded alongside `main.css`):

- `box-sizing: border-box` reset on `*`.
- Safe-area env vars on `:root` (`--safe-area-top/right/bottom/left`) from
  `env(safe-area-inset-*)`.
- SCSS radius variables (`$radius-sm/md/lg`) for SCSS-side use.

## The `cn()` Helper

Compose classes through `cn()` (`app/utils/cn.ts`) — `clsx` for conditional
joining + `tailwind-merge` to dedupe conflicting Tailwind classes (last wins).

```ts
// cn is Nuxt auto-imported from app/utils/** — no import needed in SFCs
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
  promote to `main.css` only when shared.
