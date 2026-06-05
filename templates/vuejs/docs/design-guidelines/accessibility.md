# Accessibility Checklist

Short, practical checklist grounded in what the `components/ui/` components
already do. Use it when building new UI or reviewing a change. It documents
patterns present in the template — not features that don't exist.

## What The Template Already Does

- **Visible focus**: `Button.vue` renders a focus ring
  (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`) and
  removes the tap highlight. The ring uses the themed `--color-ring` token.
- **Semantic elements**: `Button` renders a real `<button>` with an explicit
  `type` (default `"button"`, so it never submits a form by accident). `Input`
  renders a real `<input>` with an associated `<label>`.
- **Disabled handling**: `Button` sets the native `disabled` attribute and
  `disabled:pointer-events-none` so disabled controls are not interactive.
- **Icon labeling**: decorative icons are marked `aria-hidden` (e.g. the Button
  spinner); the password toggle button has `aria-label="Toggle password visibility"`.
- **Keyboard-neutral affordances**: in-field affordances (password toggle, clear,
  search) use `tabindex="-1"` so they don't add extra tab stops over the input.
- **Correct input semantics**: `Input` sets `inputmode="numeric"` for `tel` /
  `number` types, improving mobile keyboards.

## Checklist For New / Changed UI

### Semantics
- [ ] Use real interactive elements (`<button>`, `<a>`, `<input>`), not clickable `<div>`s.
- [ ] Every input has a programmatic label (use `Input`/`VeeInput`'s `label`).
- [ ] Set an explicit `type` on buttons inside forms.

### Keyboard
- [ ] All interactive elements are reachable and operable by keyboard.
- [ ] Don't add stray tab stops for decorative/secondary affordances (`tabindex="-1"`).
- [ ] Logical focus order; focus is never trapped unintentionally.

### Focus Visibility
- [ ] Custom controls expose a visible focus state — reuse the `focus-visible:ring-*`
      pattern from `Button.vue` and the themed `ring` token.

### Names & ARIA
- [ ] Icon-only buttons have an `aria-label`.
- [ ] Purely decorative icons/graphics use `aria-hidden`.
- [ ] Don't add ARIA that contradicts native semantics — prefer native elements.

### State
- [ ] Disabled controls set the native `disabled` attribute (not just styling).
- [ ] Error state is conveyed by more than color (the `Input` error message text
      accompanies the red border).
- [ ] Loading state blocks interaction (see `Button` `loading`).

### Color & Contrast
- [ ] Use theme tokens (`text-foreground`, `text-muted-foreground`) so contrast is
      consistent across light/dark — see [theming.md](./theming.md).
- [ ] Verify text/background contrast meets WCAG AA, especially `muted-foreground`
      on tinted surfaces and badge status colors.

### Motion
- [ ] Keep decorative motion (ripple, shimmer) subtle; avoid motion that conveys
      essential information only through animation.

> This is a baseline. It is not a substitute for testing with a keyboard and a
> screen reader on the actual flow you're shipping.
