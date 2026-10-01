import { mockAuthAdapter } from "@/services/auth/data/mock-auth";
import { defineQuery, Model } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { usersContract } from "@/services/users/contract";
import type { PaginatedResponse, PaginationParams } from "@/services/core";
import type { User } from "@/services/users/types/user";

export class UsersModel extends Model {
  static {
    Model.setup.call(this, {
      path: usersContract.base,
      service: usersContract.service,
      // Dev-only mock mode answers /users in the browser; undefined otherwise.
      adapter: mockAuthAdapter,
    });
  }

  static list(params: PaginationParams = {}): Promise<PaginatedResponse<User>> {
    return this.api.paginate<User>({ params });
  }

  static async get(id: string): Promise<User> {
    const res = await this.api.get<User>({ url: usersContract.paths.byId(id) });
    return res.data;
  }
}

// Queries
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () => UsersModel.list(),
});
