import { defineQuery, Model } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { usersContract } from "@/services/users/contract";
import type { UpdateUserPayload, User } from "@/services/users/types/user";

export class UsersModel extends Model {
  static {
    Model.setup.call(this, { path: usersContract.base, service: usersContract.service });
  }

  static list() {
    return this.api.get<User[]>({ url: usersContract.paths.list });
  }

  static get(id: number) {
    return this.api.get<User>({ url: usersContract.paths.byId(id) });
  }

  static update(id: number, payload: UpdateUserPayload) {
    return this.api.patch<User>({ url: usersContract.paths.byId(id), data: payload });
  }
}

// Queries
export const useUsersListQuery = defineQuery<User[]>({
  key: queryKeys.users.list,
  fetcher: async () => (await UsersModel.list()).data,
});
