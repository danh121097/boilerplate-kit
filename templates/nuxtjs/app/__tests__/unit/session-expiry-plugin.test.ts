import { endSession } from "@/services/core";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

/**
 * The client plugin that replaced the page reload: when the main session ends
 * it resets the query cache; when it expired it also routes to /login with a
 * return path. Nuxt globals (`defineNuxtPlugin`, `navigateTo`) and
 * `document.cookie` are stubbed.
 */

type PluginFn = (nuxtApp: unknown) => void;
let plugin: PluginFn;

describe("04.session-expiry.client plugin", () => {
  const navigateTo = vi.fn();
  const queryClient = new QueryClient();
  let path = "/users";
  const doc = { cookie: "" };

  // Registered once: the plugin subscribes for the app's lifetime.
  beforeAll(async () => {
    vi.stubGlobal("defineNuxtPlugin", (fn: PluginFn) => fn);
    vi.stubGlobal("navigateTo", navigateTo);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("useRouter", () => ({
      currentRoute: {
        get value() {
          return { path, fullPath: path === "/login" ? path : `${path}?page=2` };
        },
      },
    }));
    plugin = (await import("@/plugins/04.session-expiry.client")).default as unknown as PluginFn;
    plugin({
      $queryClient: queryClient,
      runWithContext: (fn: () => unknown) => fn(),
    });
  });

  beforeEach(() => {
    queryClient.clear();
    path = "/users";
    doc.cookie = "";
  });

  afterEach(() => navigateTo.mockReset());
  afterAll(() => vi.unstubAllGlobals());

  it("clears the cache and routes a signed-in user to /login", () => {
    queryClient.setQueryData(["auth.me"], { _id: "u1" });
    queryClient.setQueryData(["users.list"], { data: [] });

    endSession("expired", "MAIN");

    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
    expect(navigateTo).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
  });

  it("a voluntary logout resets the cache without navigating", () => {
    queryClient.setQueryData(["auth.me"], { _id: "u1" });
    queryClient.setQueryData(["users.list"], { data: [] });

    endSession("logout", "MAIN");

    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("another service's expiry leaves the main session alone", () => {
    doc.cookie = "PRISM_APP_SESSION=1";
    queryClient.setQueryData(["auth.me"], { _id: "u1" });

    endSession("expired", "ADMIN");

    expect(doc.cookie).toBe("PRISM_APP_SESSION=1");
    expect(queryClient.getQueryData(["auth.me"])).toEqual({ _id: "u1" });
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("cold load with the session hint but nothing cached → clears the hint, routes to /login", () => {
    doc.cookie = "PRISM_APP_SESSION=1";
    queryClient.setQueryData(["users.list"], { data: [] });

    endSession("expired", "MAIN");

    expect(doc.cookie).toContain("max-age=0");
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(navigateTo).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
  });

  it("clears the cache but does not navigate when already on /login", () => {
    path = "/login";
    queryClient.setQueryData(["auth.me"], { _id: "u1" });

    endSession("expired", "MAIN");

    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("expiry then login again: the mounted header observer shows the new user", async () => {
    let user: unknown = { _id: "u1" };
    const fetchMe = vi.fn(async () => user);
    const header = new QueryObserver(queryClient, {
      queryKey: ["auth.me"],
      queryFn: fetchMe,
      staleTime: Infinity,
    });
    const unsubscribe = header.subscribe(() => {});
    onTestFinished(unsubscribe);
    await new Promise((resolve) => setTimeout(resolve, 0));

    endSession("expired", "MAIN");
    expect(header.getCurrentResult().data).toBeNull();

    user = { _id: "u1", again: true }; // login succeeds → the mutation invalidates auth.me
    await queryClient.invalidateQueries({ queryKey: ["auth.me"] });

    expect(fetchMe).toHaveBeenCalledTimes(2);
    expect(header.getCurrentResult().data).toEqual({ _id: "u1", again: true });
  });
});
