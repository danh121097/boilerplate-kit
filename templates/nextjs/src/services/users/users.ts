import { defineQuery, Model } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { usersContract } from "@/services/users/contract";
import type { PaginatedResponse, PaginationParams } from "@/services/core";
import type { UpdateUserPayload, User } from "@/services/users/types/user";

export class UsersModel extends Model {
  static {
    Model.setup.call(this, { path: usersContract.base, service: usersContract.service });
  }

  static listPaginated(params: PaginationParams = {}): Promise<PaginatedResponse<User>> {
    return this.api.paginate<User>({ params });
  }

  static async get(id: number): Promise<User> {
    const res = await this.api.get<User>({ url: usersContract.paths.byId(id) });
    return res.data;
  }

  static async update(id: number, payload: UpdateUserPayload): Promise<User> {
    const res = await this.api.patch<User>({ url: usersContract.paths.byId(id), data: payload });
    return res.data;
  }
}

// Queries
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () => UsersModel.listPaginated(),
});
