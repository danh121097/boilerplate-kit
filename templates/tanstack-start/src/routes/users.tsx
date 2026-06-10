import { Badge } from "@/components/ui/badge";
import { getUsersServerFn } from "@/server/get-users";
import { defineQuery } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { User } from "@/services/users/types/user";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * Users route — SSR-first via a server function.
 *
 * `useUsersList` is one `defineQuery` definition backed by `getUsersServerFn`
 * (runs on the server — no client-only axios layer needed). The route loader
 * prefetches it via `useUsersList.queryOptions()` and the component reads it via
 * the `useUsersList()` hook: one key + one fetcher shared by both, so the
 * prefetched cache shape and the rendered shape can never disagree.
 *
 * The router's QueryClient is dehydrated on the server and hydrated on the client
 * (setupRouterSsrQueryIntegration in router.tsx), so the loader's prefetched cache
 * survives the SSR boundary: the hook reads it on the client too, without a second
 * fetch on hydration.
 *
 * The axios service layer's client-side list query lives under a distinct key
 * (`useUsersListQuery`, key "users.list.client") so a server-fn query and an
 * auth-aware client query never collide on one key.
 */
const useUsersList = defineQuery<User[]>({
  key: queryKeys.users.list,
  fetcher: () => getUsersServerFn(),
});

export const Route = createFileRoute("/users")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(useUsersList.queryOptions()),
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation();
  // Loader prefetches + the client hydrates that cache, so the hook reads it
  // synchronously on first render — server AND client — with no refetch on hydrate.
  const { data, isLoading, error } = useUsersList();
  const users = data ?? [];

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("users.title")}</h1>

      {isLoading && <p className="text-gray-500">{t("users.loading")}</p>}

      {error && <p className="text-red-600">{t("users.error", { message: error.message })}</p>}

      {!isLoading && !error && (
        <ul className="divide-y">
          {users.map((user) => (
            <li key={user.id} className="flex items-center justify-between py-2">
              <div>
                <span className="font-medium">{user.name}</span>
                <span className="ml-2 text-sm text-gray-500">{user.email}</span>
              </div>
              <Badge variant="secondary">#{user.id}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
