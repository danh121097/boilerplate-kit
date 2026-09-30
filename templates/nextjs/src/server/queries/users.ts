import { getUsersServerData } from "@/server/get-users";
import { serverQuery } from "@/server/hydrated-queries";
import { useUsersListQuery } from "@/services/users";

/** Users list: the client `useUsersListQuery` paired with its SSR fetcher. */
export const usersListServer = serverQuery(useUsersListQuery, getUsersServerData);
