"use client";

import { useSocketIO } from "@/hooks/useSocketIO";
import { cn } from "@/utils";
import { useTranslation } from "react-i18next";

/**
 * Realtime connection indicator. Mounting it opens the socket and unmounting it
 * destroys the socket, so render it only while signed in.
 */
export function SocketStatus() {
  const { authenticated } = useSocketIO();
  const { t } = useTranslation();

  const label = t(authenticated ? "socket.connected" : "socket.reconnecting");

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
