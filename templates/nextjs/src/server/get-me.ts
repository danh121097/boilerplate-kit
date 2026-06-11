import { serverApiGet } from "./server-api";
import { authContract } from "@/services/auth/contract";
import type { AuthUser } from "@/services/auth/types/auth";

export async function getMeServerData(): Promise<AuthUser | null> {
  const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
  return body?.user ?? null;
}
