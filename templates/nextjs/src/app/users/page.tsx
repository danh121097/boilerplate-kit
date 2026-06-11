import { UsersListClient } from "./users-list-client";
import { getUsersServerData } from "@/server/get-users";
import { HydratedQueries } from "@/server/hydrated-queries";
import { queryKeys } from "@/services/query-keys";

// Force dynamic rendering — this route reads auth cookies on every request.
export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <HydratedQueries prefetch={[{ queryKey: [queryKeys.users.list], queryFn: getUsersServerData }]}>
      <UsersListClient />
    </HydratedQueries>
  );
}
