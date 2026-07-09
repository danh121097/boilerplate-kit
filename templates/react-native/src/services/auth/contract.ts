/**
 * Auth endpoint contract — single source for this module's request paths +
 * React Query keys, shared by the client Model and screens. Reference
 * `authContract.paths.*` / `queryKeys.auth.*` instead of inline strings so a
 * rename ripples cleanly.
 */
export const authContract = {
  service: "MAIN",
  base: "/auth",
  paths: {
    me: "/auth/me",
    login: "/auth/login",
    register: "/auth/register",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
  },
  keys: {
    me: "auth.me",
    login: "auth.login",
    register: "auth.register",
    logout: "auth.logout",
  },
} as const;
