"use client";

import { Badge } from "@/components/ui/badge";
import { useUsersListQuery } from "@/services/users";
import { useTranslation } from "react-i18next";

/**
 * Client users list — reads `useUsersListQuery`, hydrated from the server prefetch
 * in the parent Server Component, so it renders the server-fetched data on first
 * paint with no refetch. React Query owns refetch/invalidation from here on the
 * client (cookie-based auth, no token storage).
 */
export function UsersListClient() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useUsersListQuery();

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("users.title")}</h1>

      {isLoading && <p className="text-gray-500">{t("users.loading")}</p>}

      {error && (
        <p className="text-red-600">
          {t("users.error", { message: error.error_message || error.message })}
        </p>
      )}

      {!isLoading && !error && (
        <ul className="divide-y">
          {data?.data.map((user) => (
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
