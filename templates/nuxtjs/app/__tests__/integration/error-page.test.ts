import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import type { Component } from "vue";
import * as Vue from "vue";

/** `app/error.vue`: not-found content for a 404, a generic message otherwise. */

let ErrorPage: Component;

async function render(statusCode: number) {
  const app = createSSRApp({ render: () => h(ErrorPage, { error: { statusCode } }) });
  app.component("UiButton", (_props: object, { slots }: { slots: Vue.Slots }) =>
    h("button", slots.default?.()),
  );
  return renderToString(app);
}

describe("error page", () => {
  beforeAll(async () => {
    vi.stubGlobal("computed", Vue.computed);
    vi.stubGlobal("clearError", () => {});
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    ErrorPage = (await import("@/error.vue")).default;
  });

  afterAll(() => vi.unstubAllGlobals());

  it("renders the not-found content for a 404", async () => {
    const html = await render(404);

    expect(html).toContain("not_found.title");
    expect(html).toContain("not_found.description");
    expect(html).toContain("not_found.back_home");
  });

  it("renders a generic message for any other status", async () => {
    const html = await render(500);

    expect(html).toContain("error.title");
    expect(html).toContain("error.back_home");
    expect(html).not.toContain("not_found.title");
  });
});
