import { useSocketIO } from "@/hooks/useSocketIO";
import { cn } from "@/utils";

/**
 * Realtime connection indicator. Mounting it opens the socket (`useSocketIO`) and
 * unmounting destroys it, so render it only while signed in.
 */
export function SocketStatus() {
  const { t } = useTranslation();
  const { authenticated } = useSocketIO();

  const label = authenticated ? t("socket.connected") : t("socket.reconnecting");

  return (
    <span role="status" title={label} className="inline-flex items-center">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          authenticated ? "bg-emerald-500" : "bg-muted-foreground",
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
