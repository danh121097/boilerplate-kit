<script setup lang="ts">
const { t, locale, setLocale } = useI18n();

type Locale = "en" | "ja";

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
        <button
          class="ml-auto rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100"
          @click="toggleLocale"
        >
          {{ locale.toUpperCase() }}
        </button>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-6 py-8">
      <slot />
    </main>
  </div>
</template>
