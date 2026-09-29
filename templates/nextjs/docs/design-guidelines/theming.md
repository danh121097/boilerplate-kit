# Theming

## Tokens

All colors are semantic tokens declared in `src/app/globals.css` (`@theme inline`)
and consumed through Tailwind utilities (`bg-background`, `text-foreground`,
`bg-card`, `text-primary`, `border-border`, …). The palette is neutral.

## Light / dark

The stylesheet defines a `.dark { ... }` block that overrides the same tokens, but
**the template does not ship a theme toggle** and no component uses `dark:`
classes. To add dark mode, toggle the `dark` class on `<html>`:

```ts
document.documentElement.classList.toggle("dark");
```

Persist the choice in a cookie (like the language) and read it in
`app/layout.tsx` so the server renders the right class on first paint; setting
it only on the client flashes the wrong theme on load.

## Radius

`--radius: 0.625rem` is the base. Components use Tailwind's `rounded-md` /
`rounded-lg`.

## Typography

No custom font is configured. The browser system-ui stack applies. Add
`next/font` in `app/layout.tsx` and set the font family on `<body>` to change it.

## Locale

The active language is a cookie (`STORAGE_KEYS.LANGUAGE`) read by the root layout,
which sets `<html lang>` on the server. The header toggle (`setLocale`) switches
between `en` and `ja`.
