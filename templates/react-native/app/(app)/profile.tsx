import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useAuthStore } from "@/stores/auth";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

/** Profile — shows the signed-in user and a logout action. */
export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { t } = useTranslation();

  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

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

        <Button variant="danger" loading={pending} onPress={onLogout} testID="logout-button">
          {t("profile.logout")}
        </Button>
      </View>
    </>
  );
}
