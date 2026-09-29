# Tailwind CSS

## Version

Tailwind CSS v4 via the `@tailwindcss/postcss` plugin (`postcss.config.mjs`). No
`tailwind.config.js` — configuration is inline in `src/app/globals.css`.

## Token setup

```css
/* src/app/globals.css */
@import "tailwindcss";
@plugin "tailwindcss-animate";

@theme inline {
  --radius: 0.625rem;

  /* semantic color tokens — utilities like bg-background, text-primary */
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(0 0% 3.9%);
  --color-primary: hsl(0 0% 9%);
  --color-primary-foreground: hsl(0 0% 98%);
  --color-secondary: hsl(0 0% 96.1%);
  --color-muted-foreground: hsl(0 0% 45.1%);
  --color-destructive: hsl(0 84.2% 60.2%);
  --color-border: hsl(0 0% 89.8%);
  --color-input: hsl(0 0% 89.8%);
  --color-ring: hsl(0 0% 3.9%);
  /* card, popover, accent, chart-1..5 … */
}
```

Each `--color-*` token is a complete `hsl()` value (the palette is neutral). A
`.dark { ... }` block redefines the same tokens for a dark palette — see
[theming](./theming.md).

## Usage rules

- Always use semantic token classes (`bg-background`, `text-foreground`,
  `bg-card`, `text-primary`, `text-muted-foreground`, `border-border`,
  `text-destructive`) rather than raw palette classes (`bg-white`,
  `text-gray-900`, `text-indigo-600`).
- Layouts follow this rule: the root layout, header and nav use tokens only. The
  active nav link is `text-primary`; inactive links are `text-muted-foreground`.
- The one intentional palette exception is the session banner (`amber-*`), a
  warning surface with no matching token.
- Avoid `@apply` — write Tailwind classes in JSX directly.
- Responsive prefix order: `sm:` → `md:` → `lg:` → `xl:`.
- Reusable utilities (`flex-center`, `no-scrollbar`, `shimmer`) are declared with
  `@utility` in `globals.css`.
