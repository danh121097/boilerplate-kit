import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
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
