# Directory Structure

```
templates/tanstack-start/
├── index.html
├── package.json               # name "tanstack-start", includes @tanstack/react-start
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vite.config.ts             # @tanstack/react-start plugin; react + tailwindcss; @/ alias
├── vitest.config.ts           # node env + @/ alias; .tsx support
├── eslint.config.ts           # flat + perfectionist + react-hooks (jiti)
├── prettier.config.ts
├── components.json            # shadcn/ui: new-york, neutral
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore                 # includes routeTree.gen.ts, .output/, dist/
├── AGENTS.md / CLAUDE.md / README.md
├── docs/                      # harness + technical docs
└── src/
    ├── env.d.ts               # Vite env type declarations
    ├── main.tsx               # Legacy SPA entry (not used in SSR plugin flow)
    ├── router.tsx             # getRouter() factory: createRouter + fresh QueryClient +
    │                            # setupRouterSsrQueryIntegration (dehydrate/hydrate)
    ├── routes/
    │   ├── __root.tsx         # Full HTML document: <html>/<head>/<body> + <HeadContent /> + <Scripts />
    │   ├── index.tsx          # / — home
    │   ├── counter.tsx        # /counter — Zustand
    │   ├── users.tsx          # /users — server function + React Query (SSR pattern)
    │   └── form.tsx           # /form — react-hook-form + zod
    ├── server/
    │   └── get-users.ts       # createServerFn handler (server-only, no axios)
    ├── components/ui/
    │   ├── button.tsx
    │   ├── badge.tsx
    │   ├── card.tsx
    │   ├── input.tsx
    │   └── form-field.tsx
    ├── stores/
    │   └── counter.ts
    ├── services/
    │   ├── index.ts
    │   ├── init-services.ts
    │   ├── core/              # Api, interceptors, HMAC, token-storage, model, tanstack, types
    │   ├── auth/              # AuthModel + mutations/queries
    │   └── users/             # UsersModel + useUsersListQuery (client-only fetcher)
    ├── i18n/
    │   ├── i18n.ts            # initI18n() + setLocale(); window guard for localStorage
    │   └── locales/en.ts, ja.ts
    ├── enums/
    │   ├── storage-keys.ts    # STORAGE_KEYS (VITE_APP_NAME prefix)
    │   └── index.ts
    ├── lib/
    │   └── utils.ts           # cn()
    ├── hooks/
    │   └── useAppVersion.ts
    ├── styles/
    │   ├── tailwind.css       # @import + @theme tokens + .dark
    │   └── main.css           # baseline resets
    └── __tests__/
        ├── unit/
        │   └── ssr-dehydrate.test.tsx  # SSR QueryClient serialization contract
        └── integration/
```
