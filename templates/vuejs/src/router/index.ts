import { authGuard } from "@/router/auth-guard";
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
    // Guests only: an authenticated user hitting /login goes to `?redirect=`.
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/login-view.vue"),
      meta: { guestOnly: true },
    },
    // Unknown URLs render the not-found page instead of a blank view.
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/not-found-view.vue"),
    },
  ],
});

router.beforeEach(authGuard);

export default router;
