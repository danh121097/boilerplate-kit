import { Badge } from "@/components/ui/badge";
import { useUsersListQuery } from "@/services/users";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

function UsersPage() {
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
          {data?.map((user) => (
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
