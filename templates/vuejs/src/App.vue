<script setup lang="ts">
import { setLocale } from "@/plugins/i18n";

const { t, locale } = useI18n();

function toggleLocale() {
  const next = locale.value === "en" ? "ja" : "en";
  setLocale(next);
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <header class="border-b bg-white">
      <nav class="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        <RouterLink to="/" class="font-semibold hover:text-indigo-600">
          {{ t("nav.home") }}
        </RouterLink>
        <RouterLink to="/counter" class="hover:text-indigo-600">{{ t("nav.counter") }}</RouterLink>
        <RouterLink to="/users" class="hover:text-indigo-600">{{ t("nav.users") }}</RouterLink>
        <RouterLink to="/form" class="hover:text-indigo-600">{{ t("nav.form") }}</RouterLink>
        <button
          class="ml-auto rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100"
          @click="toggleLocale"
        >
          {{ locale.toUpperCase() }}
        </button>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
