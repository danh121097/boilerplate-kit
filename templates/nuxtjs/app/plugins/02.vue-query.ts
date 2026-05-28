import { QueryClient, VueQueryPlugin, keepPreviousData } from "@tanstack/vue-query";

/**
 * Register TanStack Vue Query universally. On the server we still want a
 * QueryClient instance so `useQuery` calls inside `<script setup>` don't throw;
 * hydration of fetched data happens automatically when the same query key fires
 * again on the client.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
      },
    },
  });
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });
});
