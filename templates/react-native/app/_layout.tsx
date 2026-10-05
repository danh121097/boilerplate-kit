import { MockAuthBadge } from "@/components/mock-auth-badge";
import { useSessionRevalidation } from "@/hooks/useSessionRevalidation";
import { initI18n } from "@/i18n/i18n";
import { AppQueryClientProvider } from "@/providers/query-client-provider";
import { initServices } from "@/services";
import { useAuthStore, watchSessionEnd } from "@/stores/auth";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import i18n from "@/i18n/i18n";
import "@/styles/global.css";

// One-time boot wiring (runs on first import of the root layout):
// 1. i18n resources + device-locale detection.
initI18n();
// 2. axios base URLs + interceptors.
initServices();

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);

  // Session ends of the auth service: reset the query cache, and after an
  // expiry let the (app) gate redirect to /login with a `redirect`. Subscribed
  // before the hydrate effect so an expiry during boot is not missed.
  useEffect(() => watchSessionEnd(), []);

  // Re-check the session when the app returns from the background.
  useSessionRevalidation();

  // Restore any persisted session from storage on boot.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppQueryClientProvider>
          <I18nextProvider i18n={i18n}>
            <Stack screenOptions={{ headerShown: false }} />
            <MockAuthBadge />
          </I18nextProvider>
        </AppQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
