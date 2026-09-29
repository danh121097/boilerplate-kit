import {
  keepPreviousData,
  QueryClient,
  VueQueryPlugin,
  type VueQueryPluginOptions,
} from "@tanstack/vue-query";
import type { App } from "vue";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    },
  },
});

export function setupVueQuery(app: App) {
  const options: VueQueryPluginOptions = { queryClient };
  app.use(VueQueryPlugin, options);
}

export { queryClient };
