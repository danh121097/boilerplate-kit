# Directory Structure

```
templates/react-native/
├── app/                       # Expo Router file-based routes
│   ├── _layout.tsx            # Root layout: initServices, providers, navigation
│   ├── (auth)/                # Unauthenticated group
│   │   ├── _layout.tsx        # Auth stack layout
│   │   └── login.tsx          # Login screen
│   └── (app)/                 # Authenticated group (auth-gated)
│       ├── _layout.tsx        # App stack layout
│       ├── home.tsx           # Home screen
│       ├── profile.tsx        # Profile screen
│       └── _user.tsx          # User detail (if any)
├── package.json               # name "react-native-starter"
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── eas.json                   # Expo (intentionally stubbed; EAS out of scope)
├── app.json                   # Expo app config
├── eslint.config.ts           # flat + perfectionist + react-native (jiti)
├── prettier.config.ts
├── pnpm-workspace.yaml
├── tailwind.config.ts         # NativeWind preset + theme config
├── .env.example
├── .gitignore
├── AGENTS.md / CLAUDE.md / README.md
├── docs/                      # technical docs
└── src/
    ├── components/ui/         # NativeWind primitives
    │   ├── button.tsx
    │   ├── card.tsx
    │   ├── input.tsx
    │   └── text.tsx
    ├── enums/
    │   ├── storage-keys.ts    # STORAGE_KEYS (app namespace)
    │   ├── socket-events.ts   # Socket.IO event registry
    │   └── index.ts
    ├── i18n/
    │   ├── i18n.ts            # initI18n() + setLocale()
    │   └── locales/en.ts, ja.ts
    ├── providers/
    │   └── query-client-provider.tsx
    ├── services/
    │   ├── index.ts
    │   ├── init-services.ts   # setBaseURL, registerInterceptors, onSessionExpired
    │   ├── core/              # api, interceptors, hmac, token-storage, model, tanstack, types
    │   ├── auth/              # AuthModel + mutations/queries
    │   └── users/             # UsersModel + useUsersListQuery
    ├── stores/
    │   ├── auth.ts            # Zustand auth store (token, isLoggedIn)
    │   ├── socket-io.ts       # Socket.IO connection state
    │   └── index.ts
    ├── styles/
    │   └── global.css         # Tailwind entry (@tailwind base/components/utilities)
    └── __tests__/
        ├── helpers/
        ├── unit/
        └── integration/
```
