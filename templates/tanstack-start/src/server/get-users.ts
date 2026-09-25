import { serverApiPaginate } from "@/server/server-api";
import { usersContract } from "@/services/users/contract";
import { createServerFn } from "@tanstack/react-start";
import type { PaginatedResponse } from "@/services/core";
import type { ServerUnauthorized } from "@/services/core/server-auth";
import type { User } from "@/services/users/types/user";

/** Users list. `ServerUnauthorized` when the session cannot be proven
 * server-side — the query fetcher refreshes in the browser and replays. */
export const getUsersServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaginatedResponse<User> | ServerUnauthorized> => {
    return serverApiPaginate<User>(usersContract.paths.list);
  },
);
