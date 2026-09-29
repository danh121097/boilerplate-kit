import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * The router builds a web history at import, so the browser globals it reads are
 * stubbed before the module loads. Only route resolution is exercised.
 */
let router: typeof import("@/router").default;

describe("router not-found route", () => {
  beforeAll(async () => {
    // The auth store the guard imports relies on auto-imported globals.
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("computed", vue.computed);
    installLocalStorage();
    const location = { pathname: "/", search: "", hash: "", protocol: "http:", host: "localhost" };
    const history = {
      state: null,
      replaceState: vi.fn(),
      pushState: vi.fn(),
      scrollRestoration: "",
    };
    vi.stubGlobal("location", location);
    vi.stubGlobal("history", history);
    vi.stubGlobal("document", {
      querySelector: () => null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("window", {
      location,
      history,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    ({ default: router } = await import("@/router"));
  });

  it("resolves an unknown URL to the not-found route instead of an empty match", () => {
    const resolved = router.resolve("/no/such/page");

    expect(resolved.name).toBe("not-found");
    expect(resolved.matched).toHaveLength(1);
  });

  it("keeps known routes on their own record", () => {
    expect(router.resolve("/counter").name).toBe("counter");
  });
});
