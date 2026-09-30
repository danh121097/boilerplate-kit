import { readMockServerUsers } from "@/server/mock-session";
import { serverApiPaginate } from "@/server/server-api";
import { getMockAuth } from "@/services/auth/data/mock-auth-config";
import { usersContract } from "@/services/users/contract";
import { createServerFn } from "@tanstack/react-start";
import type { PaginatedResponse } from "@/services/core";
import type { ServerUnauthorized } from "@/services/core/server-session";
import type { User } from "@/services/users/types/user";

/** Users list. `ServerUnauthorized` when the session cannot be proven
 * server-side — the query fetcher refreshes in the browser and replays. With the
 * dev-only mock auth on (`VITE_AUTH_MOCK`) the mock users API answers from the
 * mock cookie instead; the branch is dropped from production builds. */
export const getUsersServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaginatedResponse<User> | ServerUnauthorized> => {
    const mock = !import.meta.env.PROD ? getMockAuth() : null;
    if (mock) return readMockServerUsers(mock);
    return serverApiPaginate<User>(usersContract.paths.list);
  },
);
