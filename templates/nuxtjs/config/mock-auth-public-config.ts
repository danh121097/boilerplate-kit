/**
 * Public runtime-config keys of the dev-only mock auth (see
 * `app/services/auth/data/mock-auth.ts`). A production build declares none of
 * them: Nuxt only lets `NUXT_PUBLIC_*` env vars override DECLARED keys, so a
 * mock email/password set on a production server can never reach the SSR
 * payload (`window.__NUXT__`), and the mock stays off.
 */
export function mockAuthPublicConfig(isProduction: boolean): Record<string, string> {
  if (isProduction) return {};
  return { authMock: "", authMockEmail: "", authMockPassword: "" };
}
