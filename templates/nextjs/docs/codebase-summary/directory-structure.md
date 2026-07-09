# Directory Structure

```
templates/nextjs/
├── next.config.ts            # Minimal Next.js config (reactCompiler)
├── postcss.config.mjs        # @tailwindcss/postcss
├── tsconfig.json             # strict + moduleResolution: bundler + @/ alias
├── vitest.config.ts          # node env + @/ alias
├── eslint.config.ts          # flat config: js + ts-eslint + perfectionist + prettier
├── prettier.config.ts
├── pnpm-workspace.yaml
├── components.json           # shadcn/ui config (rsc: true, css: app/globals.css)
├── .env.example              # NEXT_PUBLIC_* vars
├── .gitignore                # .next/, dist/, env files
├── AGENTS.md                 # Agent reading list
├── CLAUDE.md                 # Agent conventions + scripts
├── README.md                 # Quick start
├── docs/                     # Full documentation (this directory)
└── src/
    ├── app/
    │   ├── layout.tsx        # RootLayout (RSC, suppressHydrationWarning) → <Providers>
    │   ├── providers.tsx     # "use client": QueryClient + i18n + initServices (useEffect)
    │   ├── globals.css       # @import "tailwindcss"; @theme tokens; .dark
    │   ├── page.tsx          # Home ("use client")
    │   ├── counter/page.tsx  # Counter ("use client", Zustand)
    │   ├── users/page.tsx    # Users ("use client", React Query)
    │   ├── form/page.tsx     # Form ("use client", RHF + zod)
    │   └── auth-demo/        # Auth demo (RSC → server data + client login/logout)
    ├── components/ui/        # button, input, card, badge, form-field
    ├── enums/
    │   ├── storage-keys.ts   # NEXT_PUBLIC_APP_NAME-prefixed keys
    │   └── index.ts
    ├── hooks/
    │   └── useAppVersion.ts
    ├── i18n/
    │   ├── i18n.ts           # initI18n(), setLocale() — SSR-guarded
    │   └── locales/en.ts, ja.ts
    ├── lib/utils.ts          # cn()
    ├── server/               # SSR helpers (RSC only)
    │   ├── server-api.ts     # serverApiGet<T>()
    │   ├── get-me.ts         # getMeServerData()
    │   └── get-users.ts      # getUsersServerData()
    ├── services/
    │   ├── core/             # Api, interceptors, HMAC, tanstack (see services-and-stores.md)
    │   ├── auth/contract.ts, auth.ts, session.ts
    │   ├── users/contract.ts, users.ts
    │   ├── query-keys.ts     # Aggregated React Query keys
    │   ├── index.ts
    │   └── init-services.ts
    ├── stores/
    │   └── counter.ts
    └── __tests__/
        ├── helpers/http-mocks.ts
        ├── unit/             # 7 unit test files (hmac, headers, api, model, refresh-manager, tanstack, query-keys)
        └── integration/      # 2 integration test files (auth-service, interceptors-refresh)
```
