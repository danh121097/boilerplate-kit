/**
 * Users endpoint contract — single source for this module's request paths + React
 * Query keys, shared by the client Model, the SSR server fns, and routes.
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
    listClient: "users.list.client",
  },
} as const;
