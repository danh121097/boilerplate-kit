# Bootstrap Flow

```
app/_layout.tsx (root layout)
  1. initServices()              ← sets axios baseURLs + installs interceptors
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
  `Api.registerInterceptors()`. It also sets the `onSessionExpired` callback.
- Token storage is **async** — all `SecureStore.getItemAsync()` calls return promises.
- Hard logout: the interceptor calls `onSessionExpired()` callback (injected at
  init time), which navigates to `/(auth)/login` via router redirect.
- Expo Router generates typed route navigation automatically from the `app/`
  directory structure. No need for explicit route definitions.
