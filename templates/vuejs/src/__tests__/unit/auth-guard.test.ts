import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { persistAccessToken } from "@/services/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import * as pinia from "pinia";
import * as vue from "vue";

let authGuard: typeof import("@/router/auth-guard").authGuard;

function route(
  meta: Record<string, unknown>,
  query: Record<string, unknown> = {},
  fullPath = "/",
): RouteLocationNormalized {
  return { meta, query, fullPath } as unknown as RouteLocationNormalized;
}

describe("auth guard", () => {
  beforeAll(async () => {
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("computed", vue.computed);
    ({ authGuard } = await import("@/router/auth-guard"));
  });

  beforeEach(() => {
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
  });

  it("sends a guest on a protected page to /login with the return path", () => {
    expect(authGuard(route({ requiresAuth: true }, {}, "/users?page=2"))).toEqual({
      name: "login",
      query: { redirect: "/users?page=2" },
    });
  });

  it("sends a signed-in user opening /login to the safe return path", () => {
    persistAccessToken("AT", "MAIN");
    expect(authGuard(route({ guestOnly: true }, { redirect: "/users?page=2" }))).toBe(
      "/users?page=2",
    );
  });

  it("sends a signed-in user opening /login with an unsafe return path home", () => {
    persistAccessToken("AT", "MAIN");
    for (const redirect of ["//evil.test", "/\t/evil.test", "/login", undefined]) {
      expect(authGuard(route({ guestOnly: true }, { redirect }))).toBe("/");
    }
  });

  it("lets a guest open /login", () => {
    expect(authGuard(route({ guestOnly: true }))).toBeUndefined();
  });
});
