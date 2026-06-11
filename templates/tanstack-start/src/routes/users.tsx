import { Badge } from "@/components/ui/badge";
import { prefetchQueries } from "@/services/core";
import { useUsersListQuery } from "@/services/users";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * Users route — SSR-first. The loader prefetches `useUsersListQuery` (backed by
 * `getUsersServerFn`) so the server renders the full list; the client hydrates
 * that cache and renders with no extra refetch. Returns a `PaginatedResponse`
 * envelope — `data` holds the user array, `meta` holds pagination info.
 */
export const Route = createFileRoute("/users")({
  loader: prefetchQueries(useUsersListQuery),
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useUsersListQuery();
  const users = data?.data ?? [];

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
