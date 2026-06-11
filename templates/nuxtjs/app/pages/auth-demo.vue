<script setup lang="ts">
import { useLoginMutation, useLogoutMutation, useSessionQuery } from "@/services/auth";
import { useUsersListQuery } from "@/services/users";
import { useQueryClient } from "@tanstack/vue-query";
import { ref } from "vue";

// Prefetch session + users on the SERVER (the backend is fetched directly; the
// request cookie is forwarded by `serverApiGet`), dehydrated → hydrated, then both
// stay Vue Query-managed: login/logout invalidate `auth.me` + `users.list`, so the
// page renders signed-in state on first paint AND the list reloads after login.
const queryClient = useQueryClient();
await Promise.all([
  queryClient.ensureQueryData(useSessionQuery.queryOptions()),
  queryClient.ensureQueryData(useUsersListQuery.queryOptions()),
]);
const { data: sessionUser } = useSessionQuery();
const { data: usersPage } = useUsersListQuery();

const { mutate: doLogin, isPending: loginPending, error: loginError } = useLoginMutation();
const { mutate: doLogout, isPending: logoutPending } = useLogoutMutation();

const email = ref("harrynguyen@admin.com");
const password = ref("Admin@123");

function onLogin() {
  doLogin({ email: email.value, password: password.value });
}
</script>

<template>
  <section class="space-y-6">
    <header>
      <h1 class="text-3xl font-bold">Cookie Auth Demo</h1>
      <p class="mt-1 text-sm text-gray-600">
        Login state comes from <code class="rounded bg-gray-100 px-1">GET /auth/me</code> resolved
        on the server with the httpOnly cookie — no token in JS.
      </p>
    </header>

    <UiCard v-if="sessionUser" class="flex items-center justify-between">
      <div>
        <p class="font-medium">{{ sessionUser.name }}</p>
        <p class="text-sm text-gray-500">{{ sessionUser.email }}</p>
      </div>
      <div class="flex items-center gap-3">
        <UiBadge variant="secondary">{{ sessionUser.role }}</UiBadge>
        <UiButton variant="danger" size="sm" :disabled="logoutPending" @click="doLogout()">
          {{ logoutPending ? "…" : "Logout" }}
        </UiButton>
      </div>
    </UiCard>

    <UiCard v-else class="max-w-sm">
      <form class="space-y-3" @submit.prevent="onLogin">
        <h2 class="font-semibold">Login</h2>
        <UiInput v-model="email" type="email" placeholder="Email" autocomplete="username" />
        <UiInput
          v-model="password"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
        />
        <UiButton type="submit" class="w-full" :disabled="loginPending">
          {{ loginPending ? "Signing in…" : "Sign in" }}
        </UiButton>
        <p v-if="loginError" class="text-sm text-red-600">{{ loginError.message }}</p>
      </form>
    </UiCard>

    <UiCard>
      <h2 class="mb-2 font-semibold">Users — cookie-authenticated SSR fetch (direct backend)</h2>
      <p v-if="!usersPage?.data?.length" class="text-gray-500">
        No users — sign in as an admin (GET /users is admin-only).
      </p>
      <ul v-else class="divide-y">
        <li
          v-for="u in usersPage.data"
          :key="u._id"
          class="flex items-center justify-between py-1.5 text-sm"
        >
          <div>
            <span class="font-medium">{{ u.name }}</span>
            <span class="ml-2 text-gray-500">{{ u.email }}</span>
          </div>
          <UiBadge variant="secondary">#{{ u._id }}</UiBadge>
        </li>
      </ul>
    </UiCard>
  </section>
</template>
