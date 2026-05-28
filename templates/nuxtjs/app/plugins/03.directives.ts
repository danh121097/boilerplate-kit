import type { Directive } from "vue";

/**
 * Demo `v-track="'event_name'"` directive. Wire to your analytics provider.
 */
const vTrack: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    el.addEventListener("click", () => {
      if (!binding.value) return;
      console.debug(`[track] ${binding.value}`);
    });
  },
};

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive("track", vTrack);
});
