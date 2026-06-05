# Directory Structure

The real tree of this Nuxt 4 starter. App source lives under `app/` (the Nuxt 4
`srcDir`); `i18n/` and `types/` sit at the project root. Imports use the `@/`
alias → `app/`.

```
templates/nuxtjs/
├── nuxt.config.ts          # Nuxt config: modules, css, vite/tailwind, i18n, runtimeConfig
├── app/
│   ├── app.vue             # Root: <NuxtLayout><NuxtPage /></NuxtLayout>
│   ├── plugins/            # Ordered bootstrap (server + client)
│   │   ├── 01.init-services.ts   # Wire Api base URLs, token slots, refresh interceptors
│   │   ├── 02.vue-query.ts       # Install TanStack Vue Query (universal QueryClient)
│   │   ├── 03.directives.ts      # Register demo v-track directive
│   │   └── 04.vee-validate.ts    # Register global VeeForm/VeeField/VeeError
│   ├── pages/              # File-based routes
│   │   ├── index.vue       # Home — Reka UI dialog demo
│   │   ├── counter.vue     # Pinia counter store demo
│   │   ├── users.vue       # TanStack Query list demo
│   │   └── form.vue        # vee-validate + zod form demo
│   ├── layouts/
│   │   └── default.vue     # Nav header + i18n locale toggle + <slot/>
│   ├── components/ui/      # Auto-imported with "Ui" prefix (Button → <UiButton>)
│   │   ├── Button.vue, Input.vue, VeeInput.vue, Badge.vue, Card.vue
│   │   ├── badge.variants.ts     # CVA variant map for Badge
│   │   └── input.props.ts        # Shared BaseInputProps for Input/VeeInput
│   ├── composables/
│   │   └── useSocketIO.ts  # Socket.IO connection + useIo/useSocketEvent helpers
│   ├── services/           # axios service layer (see services-and-stores.md)
│   │   ├── core/           # Api, Model, interceptors, refresh, HMAC, tanstack, types
│   │   ├── auth/           # AuthModel + login/register/logout/me query+mutations
│   │   ├── users/          # UsersModel + users.list query
│   │   └── index.ts        # Barrel: re-exports auth + core + users
│   ├── stores/             # Pinia (explicit import only — no auto-import)
│   │   ├── counter.ts      # Demo counter
│   │   └── socket-io.ts    # Holds the live Socket + auth flag
│   ├── enums/              # Registries (barrel index.ts)
│   │   ├── storage-keys.ts # useStorageKeys() — prefixed localStorage keys
│   │   └── socket-events.ts# SOCKET_EVENT names + unauthorized message
│   ├── utils/              # Auto-imported helpers
│   │   ├── cn.ts           # clsx + tailwind-merge class combiner
│   │   └── date-format.ts  # dayjs formatDate/fromNow
│   ├── css/                # main.css (Tailwind v4) + main.scss
│   └── __tests__/          # Vitest unit + integration tests + helpers
├── i18n/locales/           # en.ts, ja.ts message catalogs (lazy-loaded)
├── types/i18n.d.ts         # Types vue-i18n's catalog from en.ts
├── server/                 # Empty — no Nitro routes (external backend)
└── docs/                   # This documentation
```

## Notes

- **No `server/` routes** — the directory exists but is empty; this template is a
  frontend that talks to an external backend (configure via `NUXT_PUBLIC_API_BASE_URL`).
- **Tests** live under `app/__tests__/` (unit + integration), with shared
  `helpers/` (`fake-storage`, `http-mocks`). Config: `vitest.config.ts`.
- **Config files** at root: `eslint.config.ts`, `prettier.config.ts`,
  `tsconfig.json` (extends `.nuxt/tsconfig.json`), `pnpm-workspace.yaml`.

## Related

- [Services & Stores](./services-and-stores.md)
- [Conventions](./conventions.md)
- [../codebase-summary.md](../codebase-summary.md)
