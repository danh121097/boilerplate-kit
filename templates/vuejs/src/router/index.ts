import { useAuthStore } from "@/stores/auth";
import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("@/views/home-view.vue") },
    { path: "/counter", name: "counter", component: () => import("@/views/counter-view.vue") },
    // Protected: needs a valid session. The guard bounces guests to /login.
    {
      path: "/users",
      name: "users",
      component: () => import("@/views/users-view.vue"),
      meta: { requiresAuth: true },
    },
    { path: "/form", name: "form", component: () => import("@/views/form-view.vue") },
    // Guests only: an authenticated user hitting /login is sent home.
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/login-view.vue"),
      meta: { guestOnly: true },
    },
  ],
});

// Auth guard. `isAuthenticated` reads the persisted token synchronously, so the
// decision is made without waiting on the profile fetch (`hydrate` runs in App).
router.beforeEach((to) => {
  const { isAuthenticated } = useAuthStore();

  if (to.meta.requiresAuth && !isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && isAuthenticated) {
    return { name: "home" };
  }
});

export default router;
