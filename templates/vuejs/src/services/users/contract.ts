/**
 * Users endpoint contract — single source for this module's request paths +
 * Vue Query keys, shared by the client Model and pages.
 */
export const usersContract = {
  service: "MAIN",
  base: "/users",
  paths: {
    list: "/users",
    byId: (id: number | string) => `/users/${id}`,
  },
  keys: {
    list: "users.list",
  },
} as const;
