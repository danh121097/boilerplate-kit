# Tailwind CSS

## Version

Tailwind CSS v4 via `@tailwindcss/vite` Vite plugin. No `tailwind.config.js` —
configuration is inline in `src/styles/tailwind.css`.

## Token setup

```css
/* src/styles/tailwind.css */
@import "tailwindcss";

@theme inline {
  /* radius */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  /* semantic color tokens mapped to CSS vars */
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  /* card / popover */
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
}
```

The CSS variables (`--background`, `--primary`, …) are defined in `:root` and
`.dark` blocks for light/dark theming. Tailwind classes like `bg-background`,
`text-foreground`, `border-border` consume these tokens.

## Usage rules

- Always use semantic token classes (`bg-background`, `text-primary`) rather than
  raw palette classes (`bg-white`, `text-blue-500`).
- Avoid `@apply` — write Tailwind classes in JSX directly.
- Responsive prefix order: `sm:` → `md:` → `lg:` → `xl:`.
- Dark mode via `dark:` prefix classes (`.dark` class on `<html>`).
