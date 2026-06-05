import { installI18n } from "./i18n";
import { setupVueQuery } from "./vue-query";
import { registerDirectives } from "./directives";
import type { App } from "vue";
import pinia from "./pinia";
import router from "@/router";

export function registerPlugins(app: App) {
  installI18n(app);
  app.use(pinia);
  app.use(router);
  setupVueQuery(app);
  registerDirectives(app);
}
