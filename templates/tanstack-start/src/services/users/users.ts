import { defineQuery, Model } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { UpdateUserPayload, User } from "./types/user";

/** Domain model for the /users endpoint — initialized via initServices(). */
export class UsersModel extends Model {
  static {
    Model.setup.call(this, { path: "/users", service: "MAIN" });
  }

  static list() {
    return this.api.get<User[]>();
  }

  static get(id: number) {
    return this.api.get<User>({ url: `${this.path}/${id}` });
  }

  static update(id: number, payload: UpdateUserPayload) {
    return this.api.patch<User>({ url: `${this.path}/${id}`, data: payload });
  }
}

export const useUsersListQuery = defineQuery<User[]>({
  key: queryKeys.users.listClient,
  fetcher: async () => (await UsersModel.list()).data,
});
