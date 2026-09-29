import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuthStore } from "@/stores/auth";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Shown while restoring the session failed transiently (offline, timeout, 5xx):
 * the user stays signed in and can retry. Renders nothing otherwise, including
 * after a 401 (an ended session goes through the normal logged-out flow).
 */
export function SessionBanner() {
  const hydrateError = useAuthStore((s) => s.hydrateError);
  const retryHydrate = useAuthStore((s) => s.retryHydrate);

  const { t } = useTranslation();

  const [retrying, setRetrying] = useState(false);

  if (!hydrateError) return null;

  async function onRetry() {
    setRetrying(true);
    try {
      await retryHydrate();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} className="border-t border-border bg-secondary">
      <View
        accessibilityRole="alert"
        testID="session-banner"
        className="flex-row items-center gap-3 px-4 py-3"
      >
        <Text variant="muted" className="flex-1">
          {t("session.unavailable")}
        </Text>
        <Button
          size="sm"
          variant="outline"
          loading={retrying}
          onPress={onRetry}
          testID="session-retry"
        >
          {t("session.retry")}
        </Button>
      </View>
    </SafeAreaView>
  );
}
