import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      // React Native has no window focus; refetch on app foreground is handled by
      // Query's AppState integration if wired — off by default here.
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  },
});

interface Props {
  children: ReactNode;
}

/** Wraps the app with a shared QueryClient instance. */
export function AppQueryClientProvider({ children }: Props) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
