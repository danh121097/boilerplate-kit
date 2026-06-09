# Accessibility

## Principles

- Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, `<section>`, `<label>`).
- Every interactive element must have a visible focus ring (`ring-2 ring-ring`).
- Color is never the sole means of conveying information — pair with text or icon.
- Minimum contrast ratio: 4.5:1 for body text (WCAG AA).

## FormField and labels

`FormField` generates a unique id via `useId()` and links `<label htmlFor={id}>`
to `<input id={id}>`. Never omit labels — use `sr-only` to visually hide when
a visible label is not desired:

```tsx
<label htmlFor={id} className="sr-only">Email</label>
```

## Focus management

TanStack Router handles scroll restoration and focus management between route
transitions automatically. For modals and dialogs, use Radix UI Dialog (ships
with shadcn/ui) which traps focus and restores it on close.

## Button loading state

`Button` renders a spinner and sets `aria-disabled` when `loading={true}`, and
`aria-busy` via the disabled attribute. Never remove the button from the DOM
during loading — this causes focus loss.

## ARIA landmarks

Wrap page content in `<main>` within the root layout. Navigation links are
inside `<nav>`. Use `aria-current="page"` on the active nav link:

```tsx
<Link to="/counter" aria-current={isActive ? "page" : undefined}>
  Counter
</Link>
```

## Language attribute

Set `lang` on `<html>` to match the active locale. Update it when the user
changes language:

```ts
document.documentElement.lang = locale; // "en" | "ja"
```
