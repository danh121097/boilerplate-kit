import type { App } from "vue";
import {
  keepPreviousData,
  QueryClient,
  VueQueryPlugin,
  type VueQueryPluginOptions,
} from "@tanstack/vue-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      placeholderData: keepPreviousData,
    },
  },
});

export function setupVueQuery(app: App) {
  const options: VueQueryPluginOptions = { queryClient };
  app.use(VueQueryPlugin, options);
}

export { queryClient };
