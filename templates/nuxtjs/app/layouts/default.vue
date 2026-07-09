<script setup lang="ts">
import { useLogoutMutation, useSessionQuery } from "@/services/auth";
import { useQueryClient } from "@tanstack/vue-query";

type Locale = "en" | "ja";

const queryClient = useQueryClient();
await queryClient.ensureQueryData(useSessionQuery.queryOptions());

const { locale, t, setLocale } = useI18n();
const { data: sessionUser } = useSessionQuery();
const { mutate: doLogout, isPending: logoutPending } = useLogoutMutation();

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
      <slot />
    </main>
  </div>
</template>
