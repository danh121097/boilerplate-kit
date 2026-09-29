import { useSocketIOStore } from "@/stores/socket-io";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

/**
 * Realtime connection indicator: a small dot, green once the server confirmed the
 * connection, grey while connecting or reconnecting. It only reads the store; the
 * signed-in layout owns the socket, since every screen's header renders its own dot.
 */
export function SocketStatus() {
  const authenticated = useSocketIOStore((s) => s.authenticated);

  const { t } = useTranslation();

  const label = t(authenticated ? "socket.connected" : "socket.reconnecting");

  return (
    <View className="px-2">
      <View
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={label}
        className={
          authenticated
            ? "size-2 rounded-full bg-emerald-500"
            : "size-2 rounded-full bg-muted-foreground"
        }
      />
    </View>
  );
}
