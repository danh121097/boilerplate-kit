import { shouldDehydrateQuery } from "@/services/core";
import { UsersModel } from "@/services/users";
import { dehydrate, QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, createSSRApp, h, onServerPrefetch, toValue } from "vue";
import { renderToString } from "vue/server-renderer";
import type { PaginatedResponse } from "@/services/core";
import type { User } from "@/services/users";
import type { Component } from "vue";

/**
 * The /users page server-renders the state the client hydrates: the list when
 * the users fetch succeeds, the error when it fails, and the loading state for a
 * 401 the browser refreshes. The page is rendered with `renderToString` on a
 * real QueryClient and dehydrated the way `02.vue-query.ts` does; Nuxt
 * auto-imports are stubbed and the users endpoint is mocked at the Model.
 */

const USERS = {
  status: "success",
  data: [
    { _id: "u1", name: "Ada Lovelace", email: "ada@example.com" },
    { _id: "u2", name: "Alan Turing", email: "alan@example.com" },
  ],
  meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
} as unknown as PaginatedResponse<User>;

let UsersPage: Component;

async function renderOnServer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = createSSRApp(UsersPage);
  app.use(VueQueryPlugin, { queryClient });
  app.component("UiBadge", (_props, { slots }) => h("span", slots.default?.()));
  const html = await renderToString(app);
  const state = dehydrate(queryClient, { shouldDehydrateQuery });
  return { html, queries: state.queries };
}

describe("users page SSR", () => {
  beforeAll(async () => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("toValue", toValue);
    vi.stubGlobal("onServerPrefetch", onServerPrefetch);
    vi.stubGlobal("definePageMeta", () => {});
    vi.stubGlobal("useNuxtApp", () => ({ isHydrating: false, ssrContext: {} }));
    vi.stubGlobal("useI18n", () => ({
      t: (key: string, params?: { message?: string }) =>
        params?.message ? `${key}: ${params.message}` : key,
    }));
    UsersPage = (await import("@/pages/users.vue")).default;
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(() => vi.unstubAllGlobals());

  it("renders the fetched list, not the loading state", async () => {
    vi.spyOn(UsersModel, "list").mockResolvedValue(USERS);

    const { html, queries } = await renderOnServer();

    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Alan Turing");
    expect(html).not.toContain("users.loading");
    expect(queries[0]?.state).toMatchObject({ status: "success", data: USERS });
  });

  it("renders the error and ships it for the client to hydrate", async () => {
    const failure = { error_code: 500, message: "boom", error_message: "Server down" };
    vi.spyOn(UsersModel, "list").mockRejectedValue(failure);

    const { html, queries } = await renderOnServer();

    expect(html).toContain("users.error: Server down");
    expect(html).not.toContain("users.loading");
    expect(queries[0]?.state).toMatchObject({ status: "error", error: failure });
  });

  it("leaves a 401 to the browser: renders loading and ships nothing", async () => {
    vi.spyOn(UsersModel, "list").mockRejectedValue({ error_code: 401, message: "unauthorized" });

    const { html, queries } = await renderOnServer();

    expect(html).toContain("users.loading");
    expect(html).not.toContain("users.error");
    expect(queries).toEqual([]);
  });
});
