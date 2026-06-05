import { vTrack } from "@/directives";
import type { App } from "vue";

export function registerDirectives(app: App) {
  app.directive("track", vTrack);
}
