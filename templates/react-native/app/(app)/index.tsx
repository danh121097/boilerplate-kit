import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useUsersListQuery } from "@/services/users";
import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

/** Home — greets the user and lists users via TanStack Query + the users service. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useUsersListQuery();

  return (
    <>
      <Stack.Screen options={{ title: t("home.welcome") }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-6">
        <Text variant="heading">{t("home.welcome")} 👋</Text>
        <Text variant="muted">{t("home.description")}</Text>

        <Link href="/profile" asChild>
          <Button variant="outline">{t("home.profile")}</Button>
        </Link>

        <Text variant="title" className="mt-2">
          {t("users.title")}
        </Text>

        {isLoading ? <Text variant="muted">{t("users.loading")}</Text> : null}
        {error ? (
          <Text variant="error">
            {t("users.error", { message: error.error_message || error.message })}
          </Text>
        ) : null}

        {!isLoading && !error ? (
          <Card className="gap-3 p-4">
            {data?.length ? (
              data.map((user) => (
                <View key={user._id} className="flex-row items-center justify-between">
                  <View>
                    <Text variant="body" className="font-medium">
                      {user.name}
                    </Text>
                    <Text variant="muted">{user.email}</Text>
                  </View>
                  <Text variant="muted">#{user._id}</Text>
                </View>
              ))
            ) : (
              <Text variant="muted">{t("users.empty")}</Text>
            )}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
