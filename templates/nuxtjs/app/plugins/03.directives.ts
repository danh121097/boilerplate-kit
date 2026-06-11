import type { Directive } from "vue";

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
