import { serverApiPaginate } from "@/server/server-api";
import { usersContract } from "@/services/users/contract";
import type { PaginatedResponse } from "@/services/core";
import type { User } from "@/services/users/types/user";

/** Users list for SSR prefetch. Throws on any failure (incl. an expired access
 * cookie) so the client query refetches — and refreshes — instead of caching an
 * empty list. */
export async function getUsersServerData(): Promise<PaginatedResponse<User>> {
  return serverApiPaginate<User>(usersContract.paths.list);
}
