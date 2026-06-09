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
├── .gitignore                # .next/, harness.db, harness-cli*
├── AGENTS.md                 # Agent reading list + harness entry
├── CLAUDE.md                 # Agent conventions + scripts
├── README.md                 # Quick start
├── docs/                     # Full documentation (this directory)
└── src/
    ├── app/
    │   ├── layout.tsx        # RootLayout (RSC) — imports globals.css, wraps <Providers>
    │   ├── providers.tsx     # "use client": QueryClientProvider + I18nextProvider + initServices
    │   ├── globals.css       # @import "tailwindcss"; @theme tokens; .dark
    │   ├── page.tsx          # Home ("use client")
    │   ├── counter/page.tsx  # Counter ("use client", Zustand)
    │   ├── users/page.tsx    # Users ("use client", React Query)
    │   └── form/page.tsx     # Form ("use client", RHF + zod)
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
    ├── services/
    │   ├── core/             # See services-and-stores.md
    │   ├── auth/
    │   ├── users/
    │   ├── index.ts
    │   └── init-services.ts
    ├── stores/
    │   └── counter.ts
    └── __tests__/
        ├── helpers/fake-storage.ts, http-mocks.ts
        ├── unit/             # 7 unit test files
        └── integration/      # 2 integration test files
```
