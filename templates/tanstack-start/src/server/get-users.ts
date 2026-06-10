import { serverApiGet } from "./server-api";
import { usersContract } from "@/services/users/contract";
import { createServerFn } from "@tanstack/react-start";
import type { User } from "@/services/users/types/user";

export const getUsersServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<User[]> => {
    const body = await serverApiGet<User[]>(usersContract.paths.list);
    return body ?? [];
  },
);
