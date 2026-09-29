# Directory Structure

```
templates/nextjs/
├── next.config.ts            # Empty Next.js config (defaults)
├── postcss.config.mjs        # @tailwindcss/postcss
├── tsconfig.json             # strict baseline + moduleResolution: bundler + @/ alias
├── vitest.config.ts          # node env + @/ alias
├── eslint.config.ts          # flat config: js + ts-eslint + perfectionist + prettier
├── prettier.config.ts
├── pnpm-workspace.yaml
├── components.json           # shadcn/ui config (rsc: true, css: app/globals.css)
├── .env.example              # NEXT_PUBLIC_* vars
├── .gitignore                # .next/, dist/, env files (.vscode is tracked)
├── .vscode/                  # editor settings + recommended extensions
├── eslint-rules/             # local/sort-leading-declarations
├── AGENTS.md                 # Agent reading list
├── CLAUDE.md                 # Agent conventions + scripts
├── README.md                 # Quick start
├── docs/                     # Full documentation (this directory)
└── src/
    ├── proxy.ts              # Route guard: guest → /login?redirect=…, signed-in off /login
    ├── app/
    │   ├── layout.tsx        # RootLayout (RSC, suppressHydrationWarning) → <Providers>, header, banner
    │   ├── providers.tsx     # "use client": QueryClient + i18n + initServices + session listeners
    │   ├── globals.css       # @import "tailwindcss"; @theme tokens; .dark
    │   ├── not-found.tsx     # 404 page ("use client", localized)
    │   ├── page.tsx          # Home + dialog demo ("use client")
    │   ├── counter/page.tsx  # Counter ("use client", Zustand)
    │   ├── login/            # page.tsx (RHF + zod)
    │   ├── users/            # page.tsx (RSC prefetch) + users-list-client.tsx (React Query)
    │   └── form/page.tsx     # Form ("use client", RHF + zod)
    ├── components/
    │   ├── site-header.tsx   # Nav, active link, locale toggle, logout
    │   ├── session-banner.tsx # Session-unavailable alert + retry
    │   ├── socket-status.tsx  # Realtime connection dot (opens the socket)
    │   ├── mock-auth-badge.tsx
    │   └── ui/               # button, input, card, badge, form-field, dialog
    ├── enums/
    │   ├── storage-keys.ts   # NEXT_PUBLIC_APP_NAME-prefixed keys
    │   ├── socket-events.ts
    │   └── index.ts
    ├── hooks/
    │   └── useSocketIO.ts    # Socket.IO connection + useSocketEvent
    ├── i18n/
    │   ├── i18n.ts           # initI18n(), setLocale() — cookie-backed
    │   └── locales/en.ts, ja.ts
    ├── utils/                # cn.ts, cookie-storage.ts, date-format.ts
    ├── server/               # SSR helpers (RSC only)
    │   ├── server-api.ts     # serverApiGet / serverApiPaginate / serverApiCursorPaginate
    │   ├── session.ts        # readServerSession()
    │   ├── get-users.ts      # getUsersServerData()
    │   ├── hydrated-queries.tsx  # prefetch + HydrationBoundary
    │   ├── query-client.ts   # per-request QueryClient
    │   └── mock-server-read.ts   # dev-only mock answers for server reads
    ├── services/
    │   ├── core/             # Api, interceptors, HMAC, tanstack, pagination types (see services-and-stores.md)
    │   ├── auth/             # contract, auth (models + hooks), session (useAuth), mock auth
    │   ├── users/            # contract, users, mock-users
    │   ├── query-keys.ts     # Aggregated React Query keys
    │   ├── index.ts
    │   └── init-services.ts
    ├── stores/
    │   ├── counter.ts
    │   └── socket-io.ts
    └── __tests__/
        ├── helpers/          # http-mocks, session-browser, fake-web-locks, render-with-i18n
        ├── unit/             # core + server helpers, route guard, login schema, session banner, page render
        └── integration/      # auth service, interceptors, mock auth/users, session-* flows
```
