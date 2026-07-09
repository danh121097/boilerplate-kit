# create-prism-app

[![npm version](https://img.shields.io/npm/v/create-prism-app.svg)](https://www.npmjs.com/package/create-prism-app)
[![license](https://img.shields.io/npm/l/create-prism-app.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/create-prism-app.svg)](https://nodejs.org)

> Scaffold a production-grade, opinionated full-stack starter in seconds — one CLI, a growing collection of curated stacks.

Every starter ships with sensible defaults, auth flows, typed config, tests, and
agent-ready docs — wired together so you can `install` and start building instead
of bikeshedding setup.

```sh
npm create prism-app@latest
```

## Stacks

| Stack | Highlights |
| ----- | ---------- |
| **Vue 3** | Vite · Vue Router · Pinia · TanStack Query · Reka UI · Tailwind v4 |
| **Nuxt 4** | Pinia · TanStack Query · Reka UI · Tailwind v4 |
| **React 19** | Vite · TanStack Router · TanStack Query · Zustand · shadcn/ui · Tailwind v4 |
| **Next.js 16** | App Router · TanStack Query · Zustand · shadcn/ui · Tailwind v4 |
| **TanStack Start** | TanStack Ecosystem · Zustand · shadcn/ui · Tailwind v4 |
| **React Native** | Expo · Expo Router · NativeWind · TanStack Query · Zustand · SecureStore · JWT auth |
| **Express 5** | TypeScript · Mongoose · Socket.io · Redis · JWT auth · Postman |
| **NestJS 11** | TypeScript · Mongoose · Socket.io · Redis · JWT auth · Swagger |

Backends share the same security model — RS256 JWT access + refresh rotation
(reuse-detected), HMAC-signed requests, RBAC, optional Redis, and Socket.io.

## Quick start

Interactive (pick a stack, name, package manager):

```sh
npm  create prism-app@latest
pnpm create prism-app@latest
yarn create prism-app
bun  create prism-app
```

Or with `npx`:

```sh
npx create-prism-app@latest
```

Non-interactive (CI / scripted):

```sh
npm create prism-app@latest -- \
  --name my-app --template nestjs --pm pnpm --git --install
```

## Options

| Flag | Description |
| ---- | ----------- |
| `--name <dir>` | Target directory (also the project name) |
| `--template <id>` | `vuejs` · `nuxtjs` · `reactjs` · `nextjs` · `tanstack-start` · `react-native` · `express` · `nestjs` |
| `--pm <manager>` | `pnpm` · `bun` · `yarn` · `npm` |
| `--git` / `--no-git` | Initialize a git repository (default: prompt) |
| `--install` / `--no-install` | Install dependencies after scaffolding |
| `--force` | Scaffold into a non-empty directory |
| `--ref <branch\|tag\|sha>` | Template ref to fetch (default: `latest`) |
| `--latest` | Bump every dependency to its newest version before install |
| `--harness` | Install the optional repository-harness durable CLI into the scaffold |
| `--version` / `--help` | Print version / usage |

Requires **Node.js >= 20**.

## How it works

Templates live in [`templates/`](./templates) and are fetched on demand with
[`giget`](https://github.com/unjs/giget) from
`github:danh121097/boilerplate-kit/templates/<name>#latest` — so you always get
the current starter without installing every stack. After fetching, the CLI
rewrites `package.json`, optionally runs git init + dependency install, and prints
next steps.

## Privacy

Zero telemetry. The CLI does not collect, transmit, or store any usage data.

## Contributing a stack

The collection is designed to grow. A new stack is just a folder under
`templates/<name>/` plus three small CLI touch-points:

1. Add the starter to `templates/<name>/` (must include `package.json` + `README.md`).
2. Register the key in `src/types.ts` (`TEMPLATES`) and label it in `src/wizard/prompt-template.ts`.
3. Update the registry test in `src/__tests__/template-registry.test.ts`.

See an existing backend (`templates/nestjs`) or frontend (`templates/reactjs`)
for the conventions, then open a PR.

## Development

```sh
pnpm install
pnpm build
node dist/cli.mjs --version
pnpm test
```

Link the binary to run it from anywhere:

```sh
npm link                       # registers `create-prism-app` on your PATH
create-prism-app --version
npm unlink -g create-prism-app # undo
```

When linked, the CLI auto-detects the sibling `templates/` directory (via
`realpath` on `dist/cli.mjs`) and copies locally — no GitHub round-trip. Force a
specific templates root with `BOILERPLATE_KIT_LOCAL=/abs/path` (or `=1` for
`$cwd/templates`). Local copies skip `node_modules`, build output, lockfiles,
keys, and generated typings, so scaffolding stays clean.

## License

[MIT](./LICENSE) © danh121097
