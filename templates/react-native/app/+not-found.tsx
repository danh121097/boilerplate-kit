import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

/** Fallback for an unmatched route. */
export default function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t("not_found.title") }} />
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text variant="title">{t("not_found.title")}</Text>
        <Text variant="muted">{t("not_found.description")}</Text>
        <Link href="/" asChild>
          <Button variant="outline">{t("not_found.back_home")}</Button>
        </Link>
      </View>
    </>
  );
}
