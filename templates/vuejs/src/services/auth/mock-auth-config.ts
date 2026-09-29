/** Dev-only mock auth: the flag, its credentials and its boot warnings (see `mock-auth.ts`). */
export const MOCK_AUTH_DEFAULT_EMAIL = "demo@example.com";
export const MOCK_AUTH_DEFAULT_PASSWORD = "password";

export interface MockAuthConfig {
  email: string;
  password: string;
}

const warned = { active: false, ignored: false };

function isTruthy(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/**
 * The mock's credentials while it is on, else null. Off by default, and off in
 * a production build even when the flag is set. Warns once per page load: that
 * the mock is active, or that the flag was ignored in production.
 */
export function getMockAuth(): MockAuthConfig | null {
  if (!isTruthy(import.meta.env.VITE_AUTH_MOCK)) return null;
  if (import.meta.env.PROD) {
    if (!warned.ignored) {
      warned.ignored = true;
      console.warn(
        "[mock-auth] VITE_AUTH_MOCK is ignored in production builds; using the backend.",
      );
    }
    return null;
  }
  const email = import.meta.env.VITE_AUTH_MOCK_EMAIL || MOCK_AUTH_DEFAULT_EMAIL;
  if (!warned.active) {
    warned.active = true;
    console.warn(
      `[mock-auth] VITE_AUTH_MOCK is on: /auth/* is answered in the browser, no backend auth is called. Sign in as ${email}.`,
    );
  }
  return { email, password: import.meta.env.VITE_AUTH_MOCK_PASSWORD || MOCK_AUTH_DEFAULT_PASSWORD };
}

/** Whether the mock is answering auth requests right now (drives the badge). */
export function isMockAuthEnabled(): boolean {
  return getMockAuth() !== null;
}
