# Theming

## Light / dark mode

Dark mode is implemented via `useColorScheme()` from `react-native`. Conditionally
apply dark-mode classes or theme the entire app based on system preference.

Toggle example (stored in `STORAGE_KEYS.THEME`):

```ts
import { useColorScheme } from 'react-native';

function ThemeToggle() {
  const colorScheme = useColorScheme();
  
  function toggleTheme() {
    // For simplicity, store preference and restart app or re-render root layout
    const isDark = colorScheme === 'dark';
    SecureStore.setItemAsync(STORAGE_KEYS.THEME, isDark ? 'light' : 'dark');
    // Then reload or navigate to reset
  }
  
  return <Pressable onPress={toggleTheme}><Text>Toggle Theme</Text></Pressable>;
}
```

On app load (in `app/_layout.tsx`), read the stored preference and apply it
before the first render to avoid flash.

## Color tokens in tailwind.config.ts

All semantic colors are defined in `tailwind.config.ts` under `theme.extend.colors`:

```js
colors: {
  background: 'hsl(var(--background) / <alpha-value>)',
  foreground: 'hsl(var(--foreground) / <alpha-value>)',
  primary: 'hsl(var(--primary) / <alpha-value>)',
  // ... other semantic tokens
}
```

At runtime, Tailwind resolves these to CSS variable values (light or dark mode).

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
