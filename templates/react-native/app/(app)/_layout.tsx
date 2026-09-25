import { useAuthStore } from "@/stores/auth";
import { Redirect, Stack, usePathname } from "expo-router";
import { ActivityIndicator, View } from "react-native";

/**
 * Authenticated route group. Renders a splash while the boot-time SecureStore
 * hydration is in flight (so it never flashes /login), then redirects
 * unauthenticated users to the login screen — with a `returnTo` of the current
 * path when the session expired.
 */
export default function AppLayout() {
  const pathname = usePathname();

  const { hydrated, isAuthenticated, sessionExpired } = useAuthStore();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isAuthenticated) {
    // After a session expiry, come back to this screen once signed in again.
    // A voluntary logout (or no session at boot) goes to a plain /login.
    return sessionExpired ? (
      <Redirect href={{ pathname: "/login", params: { returnTo: pathname } }} />
    ) : (
      <Redirect href="/login" />
    );
  }

  return <Stack screenOptions={{ headerShown: true }} />;
}
