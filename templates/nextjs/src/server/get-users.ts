import { serverApiPaginate } from "./server-api";
import { usersContract } from "@/services/users/contract";
import type { PaginatedResponse } from "@/services/core";
import type { User } from "@/services/users/types/user";

export async function getUsersServerData(): Promise<PaginatedResponse<User> | null> {
  return serverApiPaginate<User>(usersContract.paths.list);
}
