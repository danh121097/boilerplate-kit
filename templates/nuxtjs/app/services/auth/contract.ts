/**
 * Auth endpoint contract — single source for this module's request paths +
 * Vue Query keys, shared by the client Model, `serverApiGet`, and pages.
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
