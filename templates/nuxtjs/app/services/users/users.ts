import { defineQuery, Model, serverApiPaginate } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { usersContract } from "@/services/users/contract";
import type { PaginatedResponse } from "@/services/core";
import type { UpdateUserPayload, User } from "@/services/users/types/user";

export class UsersModel extends Model {
  static {
    Model.setup.call(this, { path: usersContract.base, service: usersContract.service });
  }

  static async get(id: number): Promise<User> {
    const res = await this.api.get<User>({ url: usersContract.paths.byId(id) });
    return res.data;
  }

  static async update(id: number, payload: UpdateUserPayload): Promise<User> {
    const res = await this.api.patch<User>({ url: usersContract.paths.byId(id), data: payload });
    return res.data;
  }

  /** Browser-side list read — refreshes-and-retries on 401 via the interceptors. */
  static list(): Promise<PaginatedResponse<User>> {
    return this.api.paginate<User>({ url: usersContract.paths.list });
  }
}

// Queries

/** SSR reads directly (no refresh possible); the browser goes through the Model
 * so an expired access cookie is refreshed. Errors reach the query either way. */
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () =>
    import.meta.server ? serverApiPaginate<User>(usersContract.paths.list) : UsersModel.list(),
});

// Mutations
