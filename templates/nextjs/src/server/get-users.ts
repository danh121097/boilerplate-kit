import { serverApiGet } from "./server-api";
import { usersContract } from "@/services/users/contract";
import type { User } from "@/services/users/types/user";

/** Fetch the users list from the backend using the forwarded auth cookie.
 * Returns an empty array when unauthenticated or when the backend is unreachable.
 * Call from RSCs or async Server Components — not from client components. */
export async function getUsersServerData(): Promise<User[]> {
  const body = await serverApiGet<User[]>(usersContract.paths.list);
  return body ?? [];
}
