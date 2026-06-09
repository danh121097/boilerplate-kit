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
├── .gitignore                 # includes routeTree.gen.ts
├── AGENTS.md / CLAUDE.md / README.md
├── docs/                      # harness + technical docs
└── src/
    ├── env.d.ts               # Vite env type declarations
    ├── main.tsx               # entry point
    ├── router.tsx             # createRouter + QueryClient context
    ├── routes/
    │   ├── __root.tsx         # RootLayout: nav + locale toggle
    │   ├── index.tsx          # / — home
    │   ├── counter.tsx        # /counter — Zustand
    │   ├── users.tsx          # /users — React Query
    │   └── form.tsx           # /form — react-hook-form + zod
    ├── providers/
    │   └── query-client-provider.tsx
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
    │   ├── core/              # api, interceptors, hmac, token-storage, model, tanstack, types
    │   ├── auth/              # AuthModel + mutations/queries
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
