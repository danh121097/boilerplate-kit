<script setup lang="ts">
import { useLogoutMutation, useMeQuery } from "@/services/auth";
import { resetQueriesToSignedOut } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { useQueryClient } from "@tanstack/vue-query";

type Locale = "en" | "ja";

const queryClient = useQueryClient();
// prefetchQuery never throws: if the SSR probe fails (e.g. an expired access
// cookie only the browser can refresh) the query is not dehydrated and the
// browser resolves it on hydration.
await queryClient.prefetchQuery(useMeQuery.queryOptions());

const { locale, t, setLocale } = useI18n();
const { data: sessionUser, error: sessionError, refetch: refetchSession } = useMeQuery();
// A transient failure (offline, timeout, 5xx) keeps the session: offer a retry
// instead of showing the visitor as logged out.
const sessionUnavailable = computed(() => Boolean(sessionError.value?.retryable));
// Settled, not success: even if the server call fails, this browser's session
// state and cached data must not outlive the logout.
const { mutate: doLogout, isPending: logoutPending } = useLogoutMutation({
  onSettled: async () => {
    resetQueriesToSignedOut(queryClient, queryKeys.auth.me);
    await navigateTo("/login");
  },
});

// The import itself is gated on the production constant: a production build has no
// badge code at all, not even an inert branch. Explicit (not the auto-imported
// `<MockAuthBadge>`) so nothing registers it for production.
const MockAuthBadge = import.meta.env.PROD
  ? null
  : defineAsyncComponent(() => import("@/components/mock-auth-badge.vue"));

const isAuthenticated = computed(() => Boolean(sessionUser.value));

function toggleLocale() {
  const next: Locale = locale.value === "en" ? "ja" : "en";
  setLocale(next);
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <header class="border-b bg-white">
      <nav class="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        <NuxtLink to="/" class="font-semibold hover:text-indigo-600">
          {{ t("nav.home") }}
        </NuxtLink>
        <NuxtLink to="/counter" class="hover:text-indigo-600">{{ t("nav.counter") }}</NuxtLink>
        <NuxtLink to="/users" class="hover:text-indigo-600">{{ t("nav.users") }}</NuxtLink>
        <NuxtLink to="/form" class="hover:text-indigo-600">{{ t("nav.form") }}</NuxtLink>
        <UiButton
          v-if="isAuthenticated"
          variant="unstyled"
          class="ml-auto hover:text-indigo-600"
          :disabled="logoutPending"
          @click="doLogout()"
        >
          {{ t("nav.logout") }}
        </UiButton>
        <NuxtLink v-else to="/login" class="ml-auto hover:text-indigo-600">
          {{ t("nav.login") }}
        </NuxtLink>
        <UiButton
          variant="unstyled"
          class="rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100"
          @click="toggleLocale"
        >
          {{ locale.toUpperCase() }}
        </UiButton>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-6 py-8">
      <p
        v-if="sessionUnavailable"
        role="alert"
        class="mb-4 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
      >
        {{ t("session.unavailable") }}
        <UiButton variant="unstyled" class="ml-auto underline" @click="refetchSession()">
          {{ t("session.retry") }}
        </UiButton>
      </p>
      <slot />
    </main>
    <MockAuthBadge v-if="MockAuthBadge" />
  </div>
</template>
