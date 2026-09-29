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
├── .gitignore                 # includes .output/, dist/ (routeTree.gen.ts + auto-imports.d.ts are committed stubs)
├── AGENTS.md / CLAUDE.md / README.md
├── docs/                      # technical docs
└── src/
    ├── env.d.ts               # Vite env type declarations
    ├── main.tsx               # Legacy SPA entry (not used in SSR plugin flow)
    ├── router.tsx             # getRouter() factory: createRouter + fresh QueryClient +
    │                            # setupRouterSsrQueryIntegration (dehydrate/hydrate)
    ├── routes/
    │   ├── __root.tsx         # Full HTML document: <html>/<head>/<body> + <HeadContent /> + <Scripts />;
    │   │                        # session effects (cache reset, expiry redirect, cross-tab sync)
    │   ├── index.tsx          # / — home
    │   ├── counter.tsx        # /counter — Zustand
    │   ├── users.tsx          # /users — server function + React Query (SSR pattern)
    │   └── form.tsx           # /form — react-hook-form + zod
    ├── server/
    │   └── get-users.ts       # createServerFn handler (server-only, no axios)
    ├── components/
    │   ├── not-found.tsx      # root notFoundComponent
    │   └── mock-auth-badge.tsx
    ├── components/ui/
    │   ├── button.tsx
    │   ├── badge.tsx
    │   ├── card.tsx
    │   ├── dialog.tsx         # Radix dialog primitives
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
