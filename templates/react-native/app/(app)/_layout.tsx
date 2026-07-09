import { useAuthStore } from "@/stores/auth";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

/**
 * Authenticated route group. Renders a splash while the boot-time SecureStore
 * hydration is in flight (so it never flashes /login), then redirects
 * unauthenticated users to the login screen.
 */
export default function AppLayout() {
  const { hydrated, isAuthenticated } = useAuthStore();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: true }} />;
}
