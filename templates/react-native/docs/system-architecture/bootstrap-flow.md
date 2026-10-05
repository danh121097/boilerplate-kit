# Bootstrap Flow

```
app/_layout.tsx (root layout)
  1. initServices()              ← sets axios baseURLs + installs interceptors
     useEffect(watchSessionEnd)  ← reacts to the end of the auth session
  2. createNativeStackNavigator()
  3. render(
       <AppQueryClientProvider>    ← shared QueryClient
         <I18nextProvider>         ← i18n context
           <AuthStack />           ← Expo Router navigation (auth/app groups)
         </I18nextProvider>
       </AppQueryClientProvider>
     )
```

**Route structure** (Expo Router file-based):
- `app/(auth)/login.tsx` — unauthenticated screen (redirect if logged in)
- `app/(app)/home.tsx` — authenticated home (redirect to login if not)
- `app/(app)/profile.tsx` — authenticated profile (users service integration)

## Key constraints

- `initServices()` (called once in `app/_layout.tsx`) must run before any `Api`
  instance makes a request, because it calls `Api.setBaseURL()` and
  `Api.registerInterceptors()` with the per-service `RefreshOptions`.
- The `(app)` gate renders a splash until `useAuthStore.hydrate()` finishes, and
  `hydrate()` awaits the `getMe` call (with its refresh and replay). A slow or
  offline start therefore keeps the splash until that request settles; the gate then
  shows the app, the session-unavailable banner, or `/login`.
- A reinstall boots signed out: the encrypted MMKV file lives in the app sandbox and is wiped on
  uninstall (see [security-auth](./security-auth.md)). On resume from the background
  `useSessionRevalidation()` re-checks the session at most every 30 s.
- Token helpers are **async** — MMKV is synchronous (its key is read from the Keychain/Keystore
  on first use), but every token helper returns a promise and a storage failure rejects.
- Hard logout: a refresh refused with 401/403, or a 401/404 on the `getMe` read
  (`isSessionGoneError`), ends the session (`endSession("expired", service)`). The root layout subscribes
  `watchSessionEnd()`, which resets the query cache to signed out and calls
  `expireSession()` for the auth service; the `(app)` gate then redirects to
  `/(auth)/login` with a `redirect` path.
- Expo Router generates typed route navigation automatically from the `app/`
  directory structure. No need for explicit route definitions.
