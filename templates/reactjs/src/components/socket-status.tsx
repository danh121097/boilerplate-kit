/**
 * Header indicator of the realtime connection. Mounting it opens the socket
 * (`useSocketIO`) and unmounting closes it, so render it only while signed in.
 */
export function SocketStatus() {
  const { authenticated } = useSocketIO();

  const { t } = useTranslation();

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
