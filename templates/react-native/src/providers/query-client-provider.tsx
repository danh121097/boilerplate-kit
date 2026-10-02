import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      // React Native has no window focus. The session is re-checked on app resume by
      // `useSessionRevalidation`; other queries are not refetched on foreground.
      refetchOnWindowFocus: false,
      staleTime: 60_000,
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
