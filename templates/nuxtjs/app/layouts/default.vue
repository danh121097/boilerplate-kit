<script setup lang="ts">
const { t, locale, setLocale } = useI18n();

const locales = ["en", "ja"] as const;
type Locale = (typeof locales)[number];

function toggleLocale() {
  const next: Locale = locale.value === "en" ? "ja" : "en";
  setLocale(next);
}
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) text-(--ui-text)">
    <header class="border-b border-(--ui-border) bg-(--ui-bg-elevated)">
      <nav class="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        <NuxtLink to="/" class="font-semibold hover:text-(--ui-primary)">
          {{ t("nav.home") }}
        </NuxtLink>
        <NuxtLink to="/counter" class="hover:text-(--ui-primary)">{{ t("nav.counter") }}</NuxtLink>
        <NuxtLink to="/users" class="hover:text-(--ui-primary)">{{ t("nav.users") }}</NuxtLink>
        <NuxtLink to="/form" class="hover:text-(--ui-primary)">{{ t("nav.form") }}</NuxtLink>
        <UButton size="xs" variant="outline" class="ml-auto" @click="toggleLocale">
          {{ locale.toUpperCase() }}
        </UButton>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-6 py-8">
      <slot />
    </main>
  </div>
</template>
