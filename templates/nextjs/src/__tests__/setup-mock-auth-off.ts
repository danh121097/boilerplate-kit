import { beforeEach, vi } from "vitest";

/**
 * Suites run with the dev-only mock auth off, whatever the developer's local
 * env says: `NEXT_PUBLIC_AUTH_MOCK*` can be set in a `.env` file or the shell, and
 * would otherwise turn the mock on under every unrelated suite. The mock-auth
 * tests turn it on explicitly.
 */
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "");
  vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK_EMAIL", "");
  vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK_PASSWORD", "");
});
