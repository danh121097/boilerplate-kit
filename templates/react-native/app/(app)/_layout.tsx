import { SessionBanner } from "@/components/session-banner";
import { useAuthStore } from "@/stores/auth";
import { Redirect, Stack, usePathname } from "expo-router";
import { ActivityIndicator, View } from "react-native";

/**
 * Authenticated route group. Renders a splash while the boot-time SecureStore
 * hydration is in flight (so it never flashes /login), then redirects guests to
 * the login screen with `?redirect=<current path>` so sign-in returns there. The
 * decision is the store's synchronous `isAuthenticated`, before any profile
 * fetch. Only an explicit logout goes to a plain /login.
 */
export default function AppLayout() {
  const pathname = usePathname();

  const { hydrated, isAuthenticated, loggedOut } = useAuthStore();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isAuthenticated) {
    // A guest (no session at boot, deep link, or an expired session) comes back
    // to this screen once signed in. A voluntary logout goes to a plain /login.
    return loggedOut ? (
      <Redirect href="/login" />
    ) : (
      <Redirect href={{ pathname: "/login", params: { redirect: pathname } }} />
    );
  }

  return (
    <View className="flex-1">
      <Stack screenOptions={{ headerShown: true }} />
      <SessionBanner />
    </View>
  );
}
