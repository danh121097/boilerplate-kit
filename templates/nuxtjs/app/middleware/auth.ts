import { hasSessionHint, loginPathWithReturn } from "@/services/core";

/**
 * Protected-route guard (`definePageMeta({ middleware: "auth" })`). Runs on the
 * server during SSR and on client navigations. The signal is the readable
 * session hint cookie, checked synchronously — no profile fetch. A hint whose
 * tokens expired still passes: the client refreshes through the normal 401
 * flow. A guest goes to `/login?redirect=<original full path>`.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (hasSessionHint()) return;
  return navigateTo(loginPathWithReturn(to.fullPath));
});
