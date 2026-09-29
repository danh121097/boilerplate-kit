import { vi } from "vitest";
import type { Router } from "vue-router";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * The auth store relies on auto-imported `defineStore` / `ref` / `computed`
 * (unplugin-auto-import is not part of the vitest config): provide them as
 * globals for the whole test file, then load the store and the session-expiry setup.
 */
export async function loadAuthStore() {
  // Plain assignment, not `vi.stubGlobal`: they must outlive `vi.unstubAllGlobals()`.
  Object.assign(globalThis, {
    defineStore: pinia.defineStore,
    ref: vue.ref,
    computed: vue.computed,
  });
  const { useAuthStore } = await import("@/stores/auth");
  const { setupSessionExpiry } = await import("@/plugins/session-expiry");
  return { useAuthStore, setupSessionExpiry };
}

/** A router stand-in parked on `route`; `replace` / `push` record navigations. */
export function makeRouter(route: { name: string; fullPath: string; requiresAuth?: boolean }) {
  const replace = vi.fn().mockResolvedValue(undefined);
  const push = vi.fn().mockResolvedValue(undefined);
  const router = {
    currentRoute: {
      value: {
        name: route.name,
        fullPath: route.fullPath,
        meta: { requiresAuth: route.requiresAuth },
      },
    },
    replace,
    push,
  } as unknown as Router;
  return { router, replace, push };
}
