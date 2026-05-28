import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("@/views/home-view.vue") },
    { path: "/counter", name: "counter", component: () => import("@/views/counter-view.vue") },
    { path: "/users", name: "users", component: () => import("@/views/users-view.vue") },
    { path: "/form", name: "form", component: () => import("@/views/form-view.vue") },
  ],
});

export default router;
