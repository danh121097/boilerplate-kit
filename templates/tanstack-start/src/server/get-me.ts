import { serverApiGet } from "@/server/server-api";
import { authContract } from "@/services/auth/contract";
import { createServerFn } from "@tanstack/react-start";
import type { AuthUser } from "@/services/auth/types/auth";

export const getMeServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthUser | null> => {
    const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
    return body?.user ?? null;
  },
);
