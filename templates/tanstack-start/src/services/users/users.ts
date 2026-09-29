import { getUsersServerFn } from "@/server/get-users";
import { mockAuthAdapter } from "@/services/auth/mock-auth";
import { defineQuery, Model, withSessionRefresh } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { usersContract } from "@/services/users/contract";
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
}

// Queries

export const useUsersListQuery = defineQuery({
  key: queryKeys.users.list,
  fetcher: () => withSessionRefresh(() => getUsersServerFn()),
});
