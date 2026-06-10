import { Badge } from "@/components/ui/badge";
import { getUsersServerFn } from "@/server/get-users";
import { defineQuery } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { User } from "@/services/users/types/user";

/**
 * Users route — SSR-first. One `defineQuery` backed by `getUsersServerFn` (server
 * only): the loader prefetches it and the component reads the same key/fetcher, so
 * the SSR-hydrated cache renders on the client with no refetch. Distinct key from
 * the axios client list (`useUsersListQuery`, "users.list.client").
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
            <li key={user._id} className="flex items-center justify-between py-2">
              <div>
                <span className="font-medium">{user.name}</span>
                <span className="ml-2 text-sm text-gray-500">{user.email}</span>
              </div>
              <Badge variant="secondary">#{user._id}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
