import { UsersListClient } from "@/app/users/users-list-client";
import { HydratedQueries } from "@/server/hydrated-queries";
import { usersListServer } from "@/server/queries";

// Force dynamic rendering — this route reads auth cookies on every request.
export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <HydratedQueries prefetch={[usersListServer()]}>
      <UsersListClient />
    </HydratedQueries>
  );
}
