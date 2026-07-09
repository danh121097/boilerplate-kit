# Build Pipeline

## Tools

| Tool | Version | Role |
|------|---------|------|
| Expo (Metro) | latest | Dev server + JS bundler (managed) |
| Expo Router | latest | File-based typed route generation |
| NativeWind v4 | 4 | Tailwind for React Native (via preset) |
| TypeScript | 5 | Type checking (separate from Metro) |
| jest-expo | latest | Unit + integration tests |
| ESLint | 9 flat config | Lint |
| Prettier | 3 | Format |

## Scripts

```
pnpm dev         → expo start (Metro dev server, press i/a/w for iOS/Android/web)
pnpm ios         → expo start --ios (open iOS simulator)
pnpm android     → expo start --android (open Android emulator)
pnpm web         → expo start --web (run in browser via react-native-web)
pnpm typecheck   → tsc --noEmit
pnpm test        → jest-expo
pnpm test:watch  → jest-expo --watch
pnpm lint        → eslint .
pnpm format      → prettier --write .
```

**No build step.** Expo handles bundling; EAS Build is optional and out of scope.

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
