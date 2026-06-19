import { registerDirectives } from "@/plugins/directives";
import { installI18n } from "@/plugins/i18n";
import { setupVueQuery } from "@/plugins/vue-query";
import type { App } from "vue";
import pinia from "@/plugins/pinia";
import router from "@/router";

export function registerPlugins(app: App) {
  installI18n(app);
  app.use(pinia);
  app.use(router);
  setupVueQuery(app);
  registerDirectives(app);
}
