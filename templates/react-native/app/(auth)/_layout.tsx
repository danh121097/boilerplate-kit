import { useAuthStore } from "@/stores/auth";
import { Redirect, Stack } from "expo-router";

/** Unauthenticated route group. Already-signed-in users are bounced to home. */
export default function AuthLayout() {
  const { hydrated, isAuthenticated } = useAuthStore();

  if (hydrated && isAuthenticated) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
