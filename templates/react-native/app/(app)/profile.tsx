import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { setLocale, type AppLocale } from "@/i18n/i18n";
import { useLogoutMutation } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

const LOCALES: readonly AppLocale[] = ["en", "ja"];

/** Profile — shows the signed-in user, an EN/JA language toggle and a logout action. */
export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearSession = useAuthStore((s) => s.clearSession);

  // onSettled, not onSuccess: sign out locally even when the server call fails.
  const logout = useLogoutMutation({
    onSettled: () => {
      clearSession();
      router.replace("/login");
    },
  });
  const loadUser = useAuthStore((s) => s.loadUser);

  const { i18n, t } = useTranslation();

  // Signed in but the profile fetch failed transiently at boot (offline, 5xx):
  // retry when the screen opens. Never after logout (no session → no /me call).
  useEffect(() => {
    if (isAuthenticated && !user) void loadUser();
  }, [isAuthenticated, user, loadUser]);

  return (
    <>
      <Stack.Screen options={{ title: t("profile.title") }} />
      <View className="flex-1 gap-4 bg-background p-6">
        <Card className="gap-2">
          <Text variant="title">{user?.name ?? "—"}</Text>
          <Text variant="muted">{user?.email ?? "—"}</Text>
          <View className="flex-row gap-2">
            <Text variant="muted">{t("profile.role")}:</Text>
            <Text variant="body">{user?.role ?? "—"}</Text>
          </View>
        </Card>

        <Card className="gap-2">
          <Text variant="muted">{t("profile.language")}</Text>
          <View className="flex-row gap-2">
            {LOCALES.map((locale) => (
              <Button
                key={locale}
                size="sm"
                variant={i18n.language === locale ? "primary" : "outline"}
                accessibilityState={{ selected: i18n.language === locale }}
                onPress={() => void setLocale(locale)}
                testID={`language-${locale}`}
              >
                {locale.toUpperCase()}
              </Button>
            ))}
          </View>
        </Card>

        <Button
          variant="danger"
          loading={logout.isPending}
          onPress={() => logout.mutate()}
          testID="logout-button"
        >
          {t("nav.logout")}
        </Button>
      </View>
    </>
  );
}
