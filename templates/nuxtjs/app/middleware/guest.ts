import { hasSessionHint, safeRedirect } from "@/services/core";

/**
 * Guest-only guard (`definePageMeta({ middleware: "guest" })`). A signed-in
 * user hitting `/login` goes to the same-origin `redirect` target, else home.
 * Same synchronous hint check as `auth`, on the server and the client.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!hasSessionHint()) return;
  return navigateTo(safeRedirect(to.query.redirect));
});
