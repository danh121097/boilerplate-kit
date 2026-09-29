# Directory Structure

```
templates/reactjs/
├── index.html
├── package.json               # name "reactjs-starter"
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vite.config.ts             # react + tanstackRouter + tailwindcss; @/ alias
├── vitest.config.ts           # node env + @/ alias
├── eslint.config.ts           # flat + perfectionist + react-hooks (jiti)
├── prettier.config.ts
├── components.json            # shadcn/ui: new-york, neutral
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore                 # routeTree.gen.ts + auto-imports.d.ts are committed stubs
├── AGENTS.md / CLAUDE.md / README.md
├── docs/                      # technical docs
└── src/
    ├── env.d.ts               # Vite env type declarations
    ├── main.tsx               # entry point
    ├── router.tsx             # createRouter + QueryClient context
    ├── routes/
    │   ├── __root.tsx         # RootLayout: nav, locale toggle, session banner, notFoundComponent
    │   ├── index.tsx          # / — home + dialog demo
    │   ├── counter.tsx        # /counter — Zustand
    │   ├── users.tsx          # /users — React Query
    │   └── form.tsx           # /form — react-hook-form + zod
    ├── providers/
    │   └── query-client-provider.tsx
    ├── components/
    │   ├── mock-auth-badge.tsx
    │   └── not-found.tsx  # root notFoundComponent
    ├── components/ui/
    │   ├── button.tsx
    │   ├── dialog.tsx
    │   ├── badge.tsx
    │   ├── card.tsx
    │   ├── input.tsx
    │   └── form-field.tsx
    ├── stores/
    │   ├── auth.ts            # session store (user, hydrate, retryHydrate)
    │   ├── counter.ts
    │   └── socket-io.ts
    ├── services/
    │   ├── index.ts
    │   ├── init-services.ts
    │   ├── session-expiry.ts
    │   ├── core/              # api, interceptors, hmac, token-storage, model, tanstack, types
    │   ├── auth/              # AuthModel + mutations/queries + login-schema (zod)
    │   └── users/             # UsersModel + useUsersListQuery
    ├── i18n/
    │   ├── i18n.ts            # initI18n() + setLocale()
    │   └── locales/en.ts, ja.ts
    ├── enums/
    │   ├── storage-keys.ts    # STORAGE_KEYS (VITE_APP_NAME prefix)
    │   └── index.ts
    ├── lib/
    │   └── utils.ts           # cn()
    ├── hooks/
    │   └── useAppVersion.ts
    └── styles/
        ├── tailwind.css       # @import + @theme tokens + .dark
        └── main.css           # baseline resets
```
