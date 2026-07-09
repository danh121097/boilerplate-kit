# NativeWind Components

Hand-written UI primitives for React Native, styled with NativeWind v4 (Tailwind
for RN). All components live in `src/components/ui/`.

## Available components

| Component | File | Based on | Notes |
|-----------|------|----------|-------|
| Button | `src/components/ui/button.tsx` | React Native `Pressable` | Semantic color variants, touch feedback |
| Input | `src/components/ui/input.tsx` | React Native `TextInput` | forwardRef for form binding, semantic classes |
| Card | `src/components/ui/card.tsx` | React Native `View` | Rounded border + padding, semantic background |
| Text | `src/components/ui/text.tsx` | React Native `Text` | Semantic font sizes + weights, accessibility |
| FormField | `src/components/ui/form-field.tsx` | Custom wrapper | label + TextInput + error message |

## Component structure

All primitives follow this pattern:

```tsx
import { forwardRef } from 'react';
import { Pressable, View } from 'react-native';
import type { PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary';
}

export const Button = forwardRef<View, ButtonProps>(
  ({ label, variant = 'primary', className, ...props }, ref) => (
    <Pressable
      ref={ref}
      className={cn(
        'rounded px-4 py-2',
        variant === 'primary' && 'bg-primary',
        variant === 'secondary' && 'bg-secondary',
        className
      )}
      {...props}
    >
      <Text className="text-white font-semibold">{label}</Text>
    </Pressable>
  )
);
Button.displayName = 'Button';
```

## Extending components

- Add new variants by combining NativeWind classes with `cn()`.
- Use `cva` (class-variance-authority) for multi-variant components if complexity grows.
- Compose with `cn()` from `src/lib/utils.ts` to merge Tailwind classes cleanly.
- Keep each component file ≤ ~200 LOC; extract sub-parts if it grows.

## cn() helper

```ts
import { cn } from "@/lib/utils";
// twMerge(clsx(...inputs)) — deduplicates conflicting Tailwind classes
<View className={cn("base-class", conditional && "extra-class", className)} />
```

## Styling rules

- Always use semantic token classes (`bg-background`, `text-primary`) over raw
  palette classes (`bg-white`, `text-blue-500`).
- Avoid inline `StyleSheet.create()` — use NativeWind classes instead.
- For complex animations, use React Native `Animated` API + NativeWind fallbacks.
- Dark mode: check `useColorScheme()` and apply `dark:` prefixed classes conditionally.
