# Theming

## Light / dark mode

Dark mode is implemented via the `.dark` class on `<html>`. When `.dark` is
present, the `.dark { ... }` block in `src/styles/tailwind.css` overrides the
`:root` CSS variable values. Tailwind's `dark:` utility classes pick up the
change automatically.

Toggle example (stored in `STORAGE_KEYS.THEME`):
```ts
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem(STORAGE_KEYS.THEME, isDark ? "dark" : "light");
}
```

On page load, read the stored preference and apply the class before the first
render to avoid flash of wrong theme.

## CSS variable reference

All colors are HSL triples without the `hsl()` wrapper:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  /* ... */
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  /* ... */
}
```

## Radius

`--radius: 0.5rem` is the base. Component-level tokens (`--radius-sm`,
`--radius-md`, `--radius-lg`, `--radius-xl`) are computed from it via `calc()` in
the `@theme inline` block and consumed as `rounded-sm`, `rounded-lg`, etc.

## Typography

No custom font configured by default. Uses the browser system-ui stack. Add a
Google Font or Fontsource package and set `font-family` on `:root` if needed.
