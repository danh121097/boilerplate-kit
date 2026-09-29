/** Dev-only mock auth: the flag, its credentials and its boot warnings (see `mock-auth.ts`). */
export const MOCK_AUTH_DEFAULT_EMAIL = "demo@example.com";
export const MOCK_AUTH_DEFAULT_PASSWORD = "password";

export interface MockAuthConfig {
  email: string;
  password: string;
}

const warned = { active: false, ignored: false };

/** The mock's credentials while it is on; set once at boot by `initMockAuth`. */
let mock: MockAuthConfig | null = null;

/**
 * "true" or "1" only. Nuxt's env override parses `NUXT_PUBLIC_AUTH_MOCK=true` / `=1`
 * to the boolean `true` / number `1` in runtimeConfig, so those are accepted too.
 */
function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Read the flag from `runtimeConfig.public` (call once at boot, inside the Nuxt
 * context — `01.init-services.ts`) and remember it. Off by default, and off in a
 * production build even when the flag is set. Warns once per process: that the
 * mock is active, or that the flag was ignored in production. Returns the
 * mock's credentials while it is on, else null.
 */
export function initMockAuth(publicConfig: Record<string, unknown>): MockAuthConfig | null {
  mock = null;
  if (!isTruthy(publicConfig.authMock)) return null;
  if (import.meta.env.PROD) {
    if (!warned.ignored) {
      warned.ignored = true;
      console.warn(
        "[mock-auth] NUXT_PUBLIC_AUTH_MOCK is ignored in production builds; using the backend.",
      );
    }
    return null;
  }
  const email = text(publicConfig.authMockEmail) || MOCK_AUTH_DEFAULT_EMAIL;
  if (!warned.active) {
    warned.active = true;
    console.warn(
      `[mock-auth] NUXT_PUBLIC_AUTH_MOCK is on: /auth/* and /users/* are answered by the mock, no backend is called for them. Sign in as ${email}.`,
    );
  }
  mock = { email, password: text(publicConfig.authMockPassword) || MOCK_AUTH_DEFAULT_PASSWORD };
  return mock;
}

/** The mock's credentials while it is on, else null (read by the adapter). */
export function getMockAuthConfig(): MockAuthConfig | null {
  return mock;
}

/** Whether the mock is answering auth requests right now (drives the badge). */
export function isMockAuthEnabled(): boolean {
  return mock !== null;
}
