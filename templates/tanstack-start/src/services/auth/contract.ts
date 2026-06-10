/**
 * Auth endpoint contract — single source for this module's request paths + React
 * Query keys, shared by the client Model, the SSR server fns, and routes.
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
    meClient: "auth.me.client",
    login: "auth.login",
    register: "auth.register",
    logout: "auth.logout",
  },
} as const;
