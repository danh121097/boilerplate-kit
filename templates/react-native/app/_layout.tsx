import { initI18n } from "@/i18n/i18n";
import { AppQueryClientProvider } from "@/providers/query-client-provider";
import { initServices } from "@/services";
import { useAuthStore } from "@/stores/auth";
import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import i18n from "@/i18n/i18n";
import "@/styles/global.css";

// One-time boot wiring (runs on first import of the root layout):
// 1. i18n resources + device-locale detection.
initI18n();
// 2. axios base URLs + interceptors. The injected `onSessionExpired` replaces the
//    web template's `window.location.reload()`: it resets auth state and routes
//    back to /login when a 401 can't be recovered by a refresh.
initServices(() => {
  // Idempotent: a burst of concurrent unrecoverable 401s must redirect ONCE, not
  // once per failed request. After the first reset `isAuthenticated` is false, so
  // later fires no-op until the next successful login.
  if (!useAuthStore.getState().isAuthenticated) return;
  useAuthStore.setState({ user: null, isAuthenticated: false });
  router.replace("/login");
});

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);

  // Restore any persisted session from SecureStore on boot.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppQueryClientProvider>
          <I18nextProvider i18n={i18n}>
            <Stack screenOptions={{ headerShown: false }} />
          </I18nextProvider>
        </AppQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
