import { Badge } from "@/components/ui/badge";
import { getUsersServerFn } from "@/server/get-users";
import type { User } from "@/services/users/types/user";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * Users route — SSR-first via a server function.
 *
 * `getUsersServerFn` is the SINGLE source for this list: it runs on the server
 * (no client-only axios layer needed) and the SAME query options are shared by
 * both the route loader (SSR prefetch) and the component (read). One queryFn per
 * query key keeps the prefetched cache shape and the rendered shape identical —
 * mixing a server-fn loader with a different client fetcher on the same key would
 * leave the component reading data that never arrives during SSR.
 *
 * Client-side auth-aware fetching still lives in `@/services` (UsersModel /
 * useUsersListQuery) for routes that need the Bearer/refresh service layer.
 */
const usersQueryOptions = queryOptions<User[]>({
  queryKey: ["users.list"],
  queryFn: () => getUsersServerFn(),
});

export const Route = createFileRoute("/users")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(usersQueryOptions),
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation();
  // Loader pre-populates the cache, so useQuery reads it synchronously on first render.
  const { data, isLoading, error } = useQuery(usersQueryOptions);
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
