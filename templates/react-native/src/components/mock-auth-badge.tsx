import { isMockAuthEnabled } from "@/services/auth/mock-auth";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Dev signal: a small amber pill at the bottom-left while mock auth is active.
 * Renders nothing otherwise (flag off, or a production build). Never blocks touches. */
export function MockAuthBadge() {
  const insets = useSafeAreaInsets();
  if (!isMockAuthEnabled()) return null;
  return (
    <View
      role="status"
      pointerEvents="none"
      className="absolute rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5"
      style={{ bottom: insets.bottom + 12, left: insets.left + 12 }}
    >
      <Text className="text-xs font-medium text-amber-900">Mock auth</Text>
    </View>
  );
}
