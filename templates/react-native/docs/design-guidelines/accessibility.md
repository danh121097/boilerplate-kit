# Accessibility

## Principles

- Use accessible React Native components (Pressable, FlatList, VirtualizedList).
- All interactive elements must have `accessible={true}` and `accessibilityRole`.
- Color is never the sole means of conveying information — pair with text or icon.
- Minimum contrast ratio: 4.5:1 for body text (WCAG AA).

## FormField and labels

`FormField` wraps a `TextInput` with a `Text` label and optional error message.
Ensure the label visually connects to the input and is marked accessible:

```tsx
<View accessible accessibilityLabel="Email input form field">
  <Text accessibilityRole="header">{label}</Text>
  <TextInput
    accessible
    accessibilityLabel={label}
    accessibilityHint="Enter your email address"
    {...props}
  />
  {error && <Text accessibilityRole="alert">{error.message}</Text>}
</View>
```

## Focus and navigation management

Expo Router handles screen transitions. On screen focus, use `useFocusEffect` to
announce screen name to screen readers:

```tsx
import { useFocusEffect } from '@react-navigation/native';

useFocusEffect(() => {
  AccessibilityInfo.announceForAccessibility('Profile screen loaded');
});
```

## Button loading state

`Button` accepts a `disabled` prop. When loading, set `accessibilityRole="button"`
and `accessibilityState={{ disabled: true, busy: true }}`. Never remove the
button — keep it present but disabled.

```tsx
<Pressable
  disabled={isLoading}
  accessibilityRole="button"
  accessibilityState={{ disabled: isLoading, busy: isLoading }}
>
  <Text>{isLoading ? 'Loading...' : 'Submit'}</Text>
</Pressable>
```

## Screen accessibility

Each screen should declare a clear `accessibilityLabel` via its `useFocusEffect`
hook and announce important state changes (errors, success, modals opening).

## Language attribute

Pass the current locale to screen readers. Screens read locale via `useTranslation()`
and apply it to `AccessibilityInfo` calls if needed for pronunciation.
