import { authContract } from "@/services/auth/contract";
import { serverApiGet, defineQuery } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import type { AuthUser } from "@/services/auth/types/auth";

export const useSessionQuery = defineQuery<AuthUser | null>({
  key: queryKeys.auth.me,
  fetcher: async () => {
    const body = await serverApiGet<{ user?: AuthUser }>(authContract.paths.me);
    return body?.user ?? null;
  },
});

export function useAuth() {
  const session = useSessionQuery();
  return {
    user: session.data.value ?? null,
    isAuthenticated: Boolean(session.data.value),
    isLoading: session.isPending.value,
  };
}
