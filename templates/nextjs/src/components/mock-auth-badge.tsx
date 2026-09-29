import { isMockAuthEnabled } from "@/services/auth/mock-auth";

/** Dev signal: a small amber pill at the bottom-left while mock auth is active.
 * Renders nothing otherwise. The root layout loads this file only outside
 * production builds, so it never ships. */
export function MockAuthBadge() {
  if (!isMockAuthEnabled()) return null;
  return (
    <span
      role="status"
      title="NEXT_PUBLIC_AUTH_MOCK is on: auth and users are answered by the mock, not the backend"
      className="fixed bottom-3 left-3 z-50 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300"
    >
      Mock auth
    </span>
  );
}
