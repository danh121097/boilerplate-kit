# Build Pipeline

## Tools

| Tool | Version | Role |
|------|---------|------|
| Expo (Metro) | latest | Dev server + JS bundler (managed) |
| Expo prebuild (`expo run:*`) | latest | Generates the git-ignored native projects for the dev client |
| Expo Router | latest | File-based typed route generation |
| NativeWind v4 | 4 | Tailwind for React Native (via preset) |
| TypeScript | 5 | Type checking (separate from Metro) |
| jest-expo | latest | Unit + integration tests |
| ESLint | 9 flat config | Lint |
| Prettier | 3 | Format |

## Scripts

```
pnpm dev         → expo start (Metro dev server for the installed dev client)
pnpm ios         → expo run:ios (prebuild + build + run the dev client)
pnpm android     → expo run:android (prebuild + build + run the dev client)
pnpm typecheck   → tsc --noEmit
pnpm test        → jest-expo
pnpm test:watch  → jest-expo --watch
pnpm lint        → eslint . && prettier --check . (read-only)
pnpm lint:fix    → eslint . --fix && prettier --write .
pnpm format      → prettier --write .
```

**Dev build, not Expo Go.** `react-native-mmkv` v4 (with `react-native-nitro-modules`) is a native
module, so the app runs in a development build (`expo-dev-client`). `pnpm ios` / `pnpm android`
generate `ios/` / `android/` (git-ignored) and install it; rebuild after changing native
dependencies. Metro handles JS bundling; EAS Build is optional and out of scope.

## Route generation

Expo Router automatically generates typed route navigation from the `app/`
directory. File-based routes with `(auth)` and `(app)` groups define route
segments and navigation stacks. No manual route tree generation.

## TypeScript project references

```
tsconfig.json
  └── tsconfig.app.json   (src/, app/ — jsx react-native, strict, noUncheckedIndexedAccess)
```

`tsc --noEmit` type-checks the entire project. Metro handles transpilation via
Babel; TypeScript checking is a separate step.
