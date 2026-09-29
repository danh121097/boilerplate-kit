import { mockAuthAdapter } from "@/services/auth/mock-auth";
import { getMockAuthConfig } from "@/services/auth/mock-auth-config";
import { defineQuery, Model, serverApiPaginate } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { usersContract } from "@/services/users/contract";
import { answerMockServerUsers } from "@/services/users/mock-users";
import type { PaginatedResponse } from "@/services/core";
import type { UpdateUserPayload, User } from "@/services/users/types/user";

export class UsersModel extends Model {
  static {
    Model.setup.call(this, {
      path: usersContract.base,
      service: usersContract.service,
      // Dev-only mock mode answers /users in the browser; undefined otherwise.
      adapter: mockAuthAdapter,
    });
  }

  static async get(id: string): Promise<User> {
    const res = await this.api.get<User>({ url: usersContract.paths.byId(id) });
    return res.data;
  }

  static async update(id: string, payload: UpdateUserPayload): Promise<User> {
    const res = await this.api.patch<User>({ url: usersContract.paths.byId(id), data: payload });
    return res.data;
  }

  /** Browser-side list read — refreshes-and-retries on 401 via the interceptors. */
  static list(): Promise<PaginatedResponse<User>> {
    return this.api.paginate<User>({ url: usersContract.paths.list });
  }
}

// Queries

/** The SSR list read. Call it inside the request's Nuxt context: the mock cookie
 * is read before the first await. */
export function fetchUsersOnServer(): Promise<PaginatedResponse<User>> {
  // Dev-only mock mode: answered from the request's mock cookie, not the
  // backend. The branch is dropped from production builds.
  const mock = !import.meta.env.PROD ? getMockAuthConfig() : null;
  if (mock) return answerMockServerUsers(mock);
  return serverApiPaginate<User>(usersContract.paths.list);
}

/** SSR reads directly (no refresh possible); the browser goes through the Model
 * so an expired access cookie is refreshed. Errors reach the query either way. */
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () => (import.meta.server ? fetchUsersOnServer() : UsersModel.list()),
});

// Mutations
