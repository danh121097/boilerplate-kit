import { useAuthStore } from "@/stores/auth";
import { safeReturnPath } from "@/utils";
import { Redirect, Stack, useGlobalSearchParams } from "expo-router";
import type { Href } from "expo-router";

/** Unauthenticated route group. Already-signed-in users are bounced to their
 * validated `returnTo` (same target as the login screen, so the two never race
 * to different routes), else home. */
export default function AuthLayout() {
  const { hydrated, isAuthenticated } = useAuthStore();
  const { returnTo } = useGlobalSearchParams<{ returnTo?: string }>();

  if (hydrated && isAuthenticated) return <Redirect href={safeReturnPath(returnTo) as Href} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
