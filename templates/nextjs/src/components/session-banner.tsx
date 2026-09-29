"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/services/auth/session";
import { useTranslation } from "react-i18next";

interface SessionBannerProps {
  /** Show the banner (the session could not be restored for a transient reason). */
  unavailable: boolean;
  onRetry: () => void;
}

/** "Session unavailable" alert with a retry action. Renders nothing while the session is fine. */
export function SessionBanner({ unavailable, onRetry }: SessionBannerProps) {
  const { t } = useTranslation();

  if (!unavailable) return null;

  return (
    <p
      role="alert"
      className="mb-4 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
    >
      {t("session.unavailable")}
      <Button variant="unstyled" className="ml-auto underline" onClick={onRetry}>
        {t("session.retry")}
      </Button>
    </p>
  );
}

/** Session banner wired to the session query — a transient restore failure keeps
 * the user's state and offers a retry instead of showing them as logged out. */
export function SessionAlert() {
  const { sessionUnavailable, retrySession } = useAuth();

  return <SessionBanner unavailable={sessionUnavailable} onRetry={retrySession} />;
}
