import { serverApiPaginate } from "./server-api";
import { usersContract } from "@/services/users/contract";
import { createServerFn } from "@tanstack/react-start";
import type { PaginatedResponse } from "@/services/core";
import type { User } from "@/services/users/types/user";

export const getUsersServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaginatedResponse<User> | null> => {
    return serverApiPaginate<User>(usersContract.paths.list);
  },
);
