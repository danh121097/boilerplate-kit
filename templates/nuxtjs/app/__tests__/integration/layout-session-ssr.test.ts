import { AuthModel } from "@/services/auth";
import { shouldDehydrateQuery } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { UsersModel } from "@/services/users";
import { dehydrate, QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  computed,
  createSSRApp,
  defineAsyncComponent,
  h,
  onServerPrefetch,
  ref,
  toValue,
} from "vue";
import { renderToString } from "vue/server-renderer";
import type { PaginatedResponse } from "@/services/core";
import type { User } from "@/services/users";
import type { Component, FunctionalComponent } from "vue";

/**
 * The default layout resolves the session once per SSR request. A failed probe
 * is rendered (signed-out header + retry banner) and shipped as that failure; no
 * second, unawaited probe may settle while the rest of the page (here /users,
 * which waits on its own fetch) is still rendering — its result would reach the
 * payload after the header was rendered, a hydration mismatch.
 */

const SESSION_USER = { _id: "u1", email: "ada@example.com", name: "Ada", role: "admin" };
const USERS = { status: "success", data: [], meta: {} } as unknown as PaginatedResponse<User>;

let DefaultLayout: Component;
let UsersPage: Component;

const slotted: FunctionalComponent = (_props, { slots }) => h("span", slots.default?.());

async function renderUsersRoute() {
  // Same query defaults as `02.vue-query.ts`.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const app = createSSRApp({ render: () => h(DefaultLayout, null, () => h(UsersPage)) });
  app.use(VueQueryPlugin, { queryClient });
  for (const name of ["NuxtLink", "UiButton", "UiBadge"]) app.component(name, slotted);
  const html = await renderToString(app);
  const { queries } = dehydrate(queryClient, { shouldDehydrateQuery });
  return { html, session: queries.find((q) => q.queryKey[0] === queryKeys.auth.me) };
}

describe("default layout session SSR", () => {
  beforeAll(async () => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("toValue", toValue);
    vi.stubGlobal("onServerPrefetch", onServerPrefetch);
    vi.stubGlobal("defineAsyncComponent", defineAsyncComponent);
    vi.stubGlobal("definePageMeta", () => {});
    vi.stubGlobal("navigateTo", () => {});
    vi.stubGlobal("useNuxtApp", () => ({ isHydrating: false, ssrContext: {} }));
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
      locale: ref("en"),
      setLocale() {},
    }));
    DefaultLayout = (await import("@/layouts/default.vue")).default;
    UsersPage = (await import("@/pages/users.vue")).default;
  });

  // The page holds the render open, like a real backend round trip.
  const slowUsers = () =>
    vi
      .spyOn(UsersModel, "list")
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(USERS), 20)));

  afterEach(() => vi.restoreAllMocks());
  afterAll(() => vi.unstubAllGlobals());

  it("renders a failed probe once and ships that failure, not a late retry", async () => {
    slowUsers();
    const probe = vi
      .spyOn(AuthModel, "getSession")
      .mockRejectedValueOnce({ error_code: 503, message: "down", retryable: true })
      .mockResolvedValue(SESSION_USER);

    const { html, session } = await renderUsersRoute();

    expect(probe).toHaveBeenCalledTimes(1);
    expect(html).toContain("nav.login");
    expect(html).toContain("session.unavailable");
    expect(session?.state).toMatchObject({ status: "error", data: undefined });
  });

  it("shows no banner when the session is rejected with a 401", async () => {
    slowUsers();
    vi.spyOn(AuthModel, "getSession").mockRejectedValue({ error_code: 401, message: "no session" });

    const { html } = await renderUsersRoute();

    expect(html).toContain("nav.login");
    expect(html).not.toContain("session.unavailable");
  });

  it("renders a resolved session as signed in", async () => {
    slowUsers();
    const probe = vi.spyOn(AuthModel, "getSession").mockResolvedValue(SESSION_USER);

    const { html, session } = await renderUsersRoute();

    expect(probe).toHaveBeenCalledTimes(1);
    expect(html).toContain("nav.logout");
    expect(session?.state).toMatchObject({ status: "success", data: SESSION_USER });
  });
});
