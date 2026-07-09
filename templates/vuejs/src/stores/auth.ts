import { AuthModel } from "@/services/auth/auth";
import { getAccessToken } from "@/services/core";
import type { AuthUser } from "@/services/auth/types/auth";

/**
 * Session state for the SPA.
 *
 * The persisted access token (localStorage) is the synchronous source of truth
 * the router guard relies on, so navigation can be decided before the async
 * profile fetch resolves. `user` is the decoded profile — loaded lazily by
 * `hydrate()` on boot and set directly on a successful login.
 */
export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const hydrated = ref(false);

  const isAuthenticated = computed(() => Boolean(user.value) || Boolean(getAccessToken()));

  function setUser(next: AuthUser | null) {
    user.value = next;
  }

  /** Read the persisted token once at boot; if present, resolve the profile. */
  async function hydrate() {
    if (hydrated.value) return;
    if (getAccessToken()) {
      try {
        user.value = await AuthModel.getMe();
      } catch {
        // Token is missing/expired — drop it so the guard routes to /login.
        user.value = null;
        await AuthModel.logout().catch(() => {});
      }
    }
    hydrated.value = true;
  }

  /** Clear the session server-side (best effort) and client-side. */
  async function logout() {
    await AuthModel.logout().catch(() => {});
    user.value = null;
  }

  return { user, hydrated, isAuthenticated, setUser, hydrate, logout };
});
