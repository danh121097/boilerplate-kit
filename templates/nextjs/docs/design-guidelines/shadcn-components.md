# shadcn/ui Components

## Config

`components.json` — style: `new-york`, base color: `neutral`, `cssVariables: true`,
`rsc: true`, Tailwind CSS file: `src/app/globals.css`, aliases: `@/components`,
`@/components/ui`, `@/utils` (the `cn()` helper lives in `src/utils/cn.ts`).

## Available components

| Component | File                               | Notes                                                                   |
| --------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Button    | `src/components/ui/button.tsx`     | forwardRef, ripple, loading spinner, variants map                        |
| Badge     | `src/components/ui/badge.tsx`      | cva variants: default / secondary / success / warning / danger           |
| Card      | `src/components/ui/card.tsx`       | thin `div` wrapper with `rounded-lg border border-border bg-card`        |
| Input     | `src/components/ui/input.tsx`      | forwardRef native `<input>` with token classes                           |
| FormField | `src/components/ui/form-field.tsx` | label + input + error message, `useId()` for a11y                        |
| Dialog    | `src/components/ui/dialog.tsx`     | standard shadcn wrapper over `@radix-ui/react-dialog` (home page demo)   |

`dialog.tsx` exports `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`,
`DialogClose`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle` and
`DialogDescription`. It is a `"use client"` file; use `asChild` on
`DialogTrigger` / `DialogClose` to render your own `Button`.

Two components that are not primitives live next to the layout:
`components/site-header.tsx` (nav, locale toggle, logout) and
`components/session-banner.tsx` (the session-unavailable alert).

## Extending components

- Add new variants to the `variants` map inside the component file.
- Use `cva` (class-variance-authority) for multi-variant components.
- Compose with `cn()` from `@/utils` to merge Tailwind classes cleanly.
- Keep each component file ≤ ~200 LOC; extract sub-parts if it grows.

## Adding new shadcn/ui primitives

```bash
pnpm dlx shadcn@latest add <component>
```

This copies the primitive into `src/components/ui/` and adds any required
dependencies to `package.json`. Commit the generated file and adjust tokens and
variants to match the project's design language.

## cn() helper

```ts
import { cn } from "@/utils";
// twMerge(clsx(...inputs)) — deduplicates conflicting Tailwind classes
<div className={cn("base-class", conditional && "extra-class", className)} />;
```
