import { AuthModel } from "@/services/auth";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import type { Component } from "vue";
import * as Vue from "vue";

/**
 * The login page server-renders an accessible form: every field has a label tied
 * to it and the credential `autocomplete` tokens, and no error alert until a
 * sign-in fails. Nuxt auto-imports are stubbed; the real ui components render.
 */

let LoginPage: Component;
let UiVeeInput: Component;
let UiInput: Component;
let UiButton: Component;
let UiCard: Component;
let classNames: typeof import("@/utils/cn").cn;

async function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = createSSRApp(LoginPage);
  app.use(VueQueryPlugin, { queryClient });
  // Templates call the auto-imported `cn` through the component context.
  Object.assign(app.config.globalProperties, { cn: classNames });
  app.component("UiVeeInput", UiVeeInput);
  app.component("UiInput", UiInput);
  app.component("UiButton", UiButton);
  app.component("UiCard", UiCard);
  return renderToString(app);
}

describe("login page SSR", () => {
  beforeAll(async () => {
    // Nuxt auto-imports the Vue APIs the components use; expose them all.
    for (const [name, api] of Object.entries(Vue)) vi.stubGlobal(name, api);
    vi.stubGlobal("definePageMeta", () => {});
    vi.stubGlobal("navigateTo", () => {});
    vi.stubGlobal("useRoute", () => ({ query: {} }));
    vi.stubGlobal("useNuxtApp", () => ({ isHydrating: false, ssrContext: {} }));
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    classNames = (await import("@/utils/cn")).cn;
    vi.stubGlobal("cn", classNames);
    LoginPage = (await import("@/pages/login.vue")).default;
    UiVeeInput = (await import("@/components/ui/VeeInput.vue")).default;
    UiInput = (await import("@/components/ui/Input.vue")).default;
    UiButton = (await import("@/components/ui/Button.vue")).default;
    UiCard = (await import("@/components/ui/Card.vue")).default;
    vi.spyOn(AuthModel, "getSession").mockRejectedValue({ error_code: 401, message: "no session" });
  });

  afterEach(() => vi.clearAllMocks());
  afterAll(() => vi.unstubAllGlobals());

  it("ties each label to its input and sets the credential autocomplete tokens", async () => {
    const html = await render();

    for (const [label, autocomplete] of [
      ["login.email", "username"],
      ["login.password", "current-password"],
    ] as const) {
      const labelFor = new RegExp(`<label for="([^"]+)"[^>]*>\\s*${label}\\s*</label>`).exec(html);
      expect(labelFor, label).not.toBeNull();
      expect(html).toMatch(
        new RegExp(`<input id="${labelFor![1]}"[^>]*autocomplete="${autocomplete}"`),
      );
    }
  });

  it("renders no error alert before a sign-in fails", async () => {
    const html = await render();

    expect(html).not.toContain('role="alert"');
    expect(html).toContain("login.submit");
  });
});
