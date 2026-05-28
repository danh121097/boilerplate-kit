import type { App } from "vue";
import { vTrack } from "@/directives";

export function registerDirectives(app: App) {
  app.directive("track", vTrack);
}
