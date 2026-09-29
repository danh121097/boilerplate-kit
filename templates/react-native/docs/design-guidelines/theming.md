# Theming

## Light only

The app is light only: `app.json` sets `userInterfaceStyle` to `light`, and there is no
dark palette or dark toggle (the web templates do not provide one either).
`STORAGE_KEYS.THEME` is reserved if you add one.

## Color tokens in tailwind.config.ts

All semantic colors are defined in `tailwind.config.ts` under `theme.extend.colors` as
literal `hsl(...)` values (NativeWind v4 on the Tailwind v3 engine has no `@theme`).
They are the same values as the web templates' `@theme` tokens (neutral primary):

```js
colors: {
  background: "hsl(0 0% 100%)",
  foreground: "hsl(0 0% 3.9%)",
  card: { DEFAULT: "hsl(0 0% 100%)", foreground: "hsl(0 0% 3.9%)" },
  primary: { DEFAULT: "hsl(0 0% 9%)", foreground: "hsl(0 0% 98%)" },
  // secondary, muted, accent, destructive, popover, border, input, ring
}
```

When the web tokens change, change these values with them.

## Radius

Define border radius tokens in `tailwind.config.ts`:

```js
borderRadius: {
  sm: 'calc(var(--radius) - 4px)',
  md: 'calc(var(--radius) - 2px)',
  lg: 'var(--radius)',
  xl: 'calc(var(--radius) + 4px)',
}
```

Consumed as `rounded-sm`, `rounded-lg`, etc. in NativeWind classes.

## Typography

No custom font configured by default. Uses the system font stack. Add a Fontsource
package and register it in `tailwind.config.ts` under `theme.extend.fontFamily`
if needed.
