import { serverApiGet } from "./server-api";
import { authContract } from "@/services/auth/contract";
import type { AuthUser } from "@/services/auth/types/auth";

/** Fetch the current user from the backend using the forwarded auth cookie.
 * Returns null when unauthenticated or when the backend is unreachable.
 * Call from RSCs or async Server Components — not from client components. */
export async function getMeServerData(): Promise<AuthUser | null> {
  const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
  return body?.user ?? null;
}
