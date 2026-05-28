import type { Directive } from "vue";

// Demo directive — replace with your analytics call.
// Usage in template: <button v-track="'cta_click'">…</button>
export const vTrack: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    el.addEventListener("click", () => {
      const event = binding.value;
      if (!event) return;
      console.debug(`[track] ${event}`);
    });
  },
};
