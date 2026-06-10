/**
 * Central registry of every React Query / mutation key used across the service
 * layer and SSR routes. Single source of truth — prevents typos and silent
 * cache-key collisions (e.g. the SSR server-fn users list vs the auth-aware
 * client users list, which MUST stay on distinct keys).
 *
 * Reference these instead of inline string literals when calling `defineQuery`
 * / `defineMutation` or `queryClient.invalidateQueries`.
 */
export const queryKeys = {
  users: {
    /** SSR server-function list (routes/users.tsx) — prefetched in the route loader. */
    list: "users.list",
    /** Auth-aware axios client list (services/users) — distinct from `list` on purpose. */
    listClient: "users.list.client",
  },
  auth: {
    login: "auth.login",
    register: "auth.register",
    logout: "auth.logout",
    me: "auth.me",
  },
} as const;
