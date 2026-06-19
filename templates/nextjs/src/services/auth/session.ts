import { useMeQuery } from "@/services/auth/auth";

export function useAuth() {
  const session = useMeQuery();
  return {
    user: session.data ?? null,
    isAuthenticated: Boolean(session.data),
    isLoading: session.isPending,
  };
}
