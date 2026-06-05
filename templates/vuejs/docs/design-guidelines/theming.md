# Theming

Colors and radius are CSS variables defined in `src/scss/tailwind.css`. They are
shadcn-vue-compatible HSL tokens exposed as Tailwind color utilities via the
`@theme inline` block. Dark mode overrides the same variables under `.dark`.

## How It Works

1. `@theme inline { --color-*: hsl(...) }` declares light-mode tokens **and**
   registers them as Tailwind utilities (`bg-primary`, `text-muted-foreground`, …).
2. A `.dark { --color-*: hsl(...) }` block re-assigns the same variables.
3. Toggling theme = adding/removing the `dark` class on a root element
   (e.g. `<html>`). No utility class names change — only the variable values do.
4. `main.scss` binds `body` `background-color` / `color` to
   `--color-background` / `--color-foreground`, so the base surface follows the theme.

## Token Reference

HSL values, as defined in `tailwind.css`. `--radius` is `0.625rem`.

| Token (utility prefix) | Light | Dark |
| --- | --- | --- |
| `background` | `0 0% 100%` | `0 0% 3.9%` |
| `foreground` | `0 0% 3.9%` | `0 0% 98%` |
| `card` | `0 0% 100%` | `0 0% 3.9%` |
| `card-foreground` | `0 0% 3.9%` | `0 0% 98%` |
| `popover` | `0 0% 100%` | `0 0% 3.9%` |
| `popover-foreground` | `0 0% 3.9%` | `0 0% 98%` |
| `primary` | `0 0% 9%` | `0 0% 98%` |
| `primary-foreground` | `0 0% 98%` | `0 0% 9%` |
| `secondary` | `0 0% 96.1%` | `0 0% 14.9%` |
| `secondary-foreground` | `0 0% 9%` | `0 0% 98%` |
| `muted` | `0 0% 96.1%` | `0 0% 14.9%` |
| `muted-foreground` | `0 0% 45.1%` | `0 0% 63.9%` |
| `accent` | `0 0% 96.1%` | `0 0% 14.9%` |
| `accent-foreground` | `0 0% 9%` | `0 0% 98%` |
| `destructive` | `0 84.2% 60.2%` | `0 62.8% 30.6%` |
| `destructive-foreground` | `0 0% 98%` | `0 0% 98%` |
| `border` | `0 0% 89.8%` | `0 0% 14.9%` |
| `input` | `0 0% 89.8%` | `0 0% 14.9%` |
| `ring` | `0 0% 3.9%` | `0 0% 83.1%` |
| `chart-1` | `12 76% 61%` | `220 70% 50%` |
| `chart-2` | `173 58% 39%` | `160 60% 45%` |
| `chart-3` | `197 37% 24%` | `30 80% 55%` |
| `chart-4` | `43 74% 66%` | `280 65% 60%` |
| `chart-5` | `27 87% 67%` | `340 75% 55%` |

The base palette is intentionally **neutral grayscale** (`components.json`
`baseColor: "neutral"`); `chart-*` carries the only accent hues.

## Usage Rules

- Use token utilities, not raw colors: `bg-card`, `text-muted-foreground`,
  `border-input`, `text-destructive`, `ring-ring`.
- Pair foregrounds with their surface: `bg-primary` + `text-primary-foreground`,
  `bg-secondary` + `text-secondary-foreground`, etc.
- Opacity modifiers are valid on tokens (`bg-primary/90`, `bg-secondary/80`).
- To extend the palette, add `--color-<name>` in **both** the `@theme` block and
  `.dark` block so light/dark stay paired.
- A few component primitives still use literal colors deliberately:
  `Card.vue` uses `bg-white`, and `badge.variants.ts` uses fixed Tailwind palette
  colors (e.g. `bg-emerald-100`) for its status variants rather than theme tokens.

## Note On Status Colors

Badge status variants (`success` / `warning` / `danger`) are mapped to fixed
Tailwind palette colors in `badge.variants.ts`, not to the theme tokens. If you
need them theme-aware in dark mode, switch those to token-based classes.
