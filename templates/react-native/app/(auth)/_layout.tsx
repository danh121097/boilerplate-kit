import { safeReturnPath } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import { Redirect, Stack, useGlobalSearchParams } from "expo-router";
import { useEffect } from "react";
import type { Href } from "expo-router";

/** Unauthenticated route group. Already-signed-in users are bounced to their
 * validated `redirect` (same target as the login screen, so the two never race
 * to different routes), else home. */
export default function AuthLayout() {
  const { hydrated, isAuthenticated } = useAuthStore();
  const { redirect } = useGlobalSearchParams<{ redirect?: string }>();

  // A guest is on the login screen: the explicit-logout marker has done its job,
  // so the next protected screen they open gets a return path again.
  useEffect(() => {
    if (hydrated && !isAuthenticated) useAuthStore.setState({ loggedOut: false });
  }, [hydrated, isAuthenticated]);

  if (hydrated && isAuthenticated) return <Redirect href={safeReturnPath(redirect) as Href} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
