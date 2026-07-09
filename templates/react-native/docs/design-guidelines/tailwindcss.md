# NativeWind v4

## Overview

NativeWind v4 brings Tailwind CSS to React Native via a Metro preset. No CSS
files — styling is applied directly to React Native components (View, Text,
Pressable) via the `className` prop.

## Configuration

`tailwind.config.ts` exports the NativeWind v4 preset:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: 'hsl(var(--primary))',
        // ... semantic tokens
      },
    },
  },
};
```

`src/styles/global.css` registers the Tailwind directives (consumed by Metro):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Usage in components

Apply Tailwind classes to React Native primitives:

```tsx
import { View, Text, Pressable } from 'react-native';

export function Button({ label, onPress }) {
  return (
    <Pressable className="rounded bg-primary px-4 py-2" onPress={onPress}>
      <Text className="text-white font-semibold">{label}</Text>
    </Pressable>
  );
}
```

## Usage rules

- Always use semantic token classes (`bg-background`, `text-primary`) rather than
  raw palette classes (`bg-white`, `text-blue-500`).
- NativeWind classes map to React Native `StyleSheet` props; specificity/cascading
  is minimal — last class wins on conflicts.
- Responsive prefix order: `sm:` → `md:` → `lg:` → `xl:` (depends on device width).
- Dark mode: handled by conditional className logic or `useColorScheme()` hook.
