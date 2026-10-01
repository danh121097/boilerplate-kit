# Accessibility

## Principles

- Use semantic HTML (`<button>`, `<nav>`, `<main>`, `<section>`, `<label>`).
- Every interactive element has a visible focus ring (`focus-visible:ring-2 ring-ring`).
- Color is never the only signal — pair it with text or an icon.
- Minimum contrast ratio: 4.5:1 for body text (WCAG AA).

## FormField and labels

`FormField` generates a unique id via `useId()` and links `<label htmlFor={id}>`
to `<input id={id}>`; the login and form pages use it for every field. Never omit
labels — use `sr-only` to hide one visually. The login fields also set
`autoComplete="username"` / `"current-password"` for password managers.

## Errors and alerts

- Validation messages render under the field (`FormField` `error`), translated
  from i18n keys (`validation.email`, `validation.password_required`).
- A failed sign-in shows the server message (or `login.error`) in an element with
  `role="alert"`, so screen readers announce it.
- The session-unavailable banner is also `role="alert"` and carries a retry
  button.

## Focus management

Dialogs use Radix Dialog (via `components/ui/dialog.tsx`), which traps focus and
restores it on close. `DialogTitle` and `DialogDescription` give the dialog its
accessible name and description — keep them in every dialog.

## Button loading and pending states

`Button` renders a spinner and disables itself while `loading`. Submit and
logout buttons are disabled while their request is pending; never remove a button
from the DOM during loading (it drops focus).

## Navigation

The header lives in `<header><nav>` and page content in `<main>`. The active link
is highlighted with `text-primary` and marked `aria-current="page"`.

## Language attribute

The root layout sets `<html lang>` on the server from the language cookie, so it
matches the rendered locale from first paint.
