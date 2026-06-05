# create-prism-app

Scaffold an opinionated starter in seconds. One CLI, six curated stacks:

- **Vue 3** + Vite + Vue Router + Pinia + Reka UI + TanStack Query + Tailwind v4
- **Nuxt 4** + Pinia + TanStack Query + Nuxt UI + Tailwind
- **React 19** + Vite + TanStack Router + Zustand + shadcn/ui + Tailwind v4
- **Next.js 16** (App Router) + TanStack Query + Zustand + shadcn/ui + Tailwind v4
- **TanStack Start** + TanStack Query + Zustand + shadcn/ui + Tailwind v4
- **Express 5** (backend) + TypeScript + Mongoose + Socket.io + Redis + JWT/HMAC auth

> Status: alpha — phase 01 scaffolding only. CLI surface, template fetch, and the six starters land in subsequent phases.

## Usage (once published)

```sh
npm  create prism-app@latest
pnpm create prism-app@latest
yarn create prism-app
bun  create prism-app
```

Non-interactive:

```sh
npm create prism-app@latest -- --template react --name my-app --pm pnpm --git --install
```

## Privacy

Zero telemetry. The CLI does not collect, transmit, or store any usage data.

## Development

### Quick smoke test

```sh
pnpm install
pnpm build
node dist/cli.mjs --version
```

### Local link — run `create-prism-app` from anywhere

```sh
pnpm install
pnpm build
npm link              # registers the binary on your PATH (npm's global bin is already in $PATH)
create-prism-app --version
```

To unregister later: `npm unlink -g create-prism-app`.

### Scaffolding from local templates (no GitHub round-trip)

When you `npm link` this repo, the CLI **auto-detects** the sibling `templates/`
directory next to its binary (via `realpath` on the symlinked `dist/cli.mjs`)
and copies from it. No env vars needed:

```sh
# from anywhere
cd /tmp
create-prism-app my-vue-app --template vuejs --pm pnpm
cd my-vue-app && pnpm install && pnpm dev
```

In production (`npm install create-prism-app`) the published package ships only
`dist/` — no sibling `templates/` exists, so the CLI falls back to giget +
`github:danh121097/boilerplate-kit/templates/<name>#latest`.

You can force a specific local templates root with **`BOILERPLATE_KIT_LOCAL`**:

```sh
export BOILERPLATE_KIT_LOCAL=/some/other/templates    # absolute path
# or
BOILERPLATE_KIT_LOCAL=1 create-prism-app …            # resolves to ${cwd}/templates
```

Templates are copied with `node_modules`, `dist`, `.vite`, lockfiles, and the
auto-generated `auto-imports.d.ts` / `components.d.ts` filtered out — so you can
safely scaffold even when you've been running install/build inside `templates/<name>/`.

## License

MIT
