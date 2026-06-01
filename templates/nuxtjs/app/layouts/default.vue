<script setup lang="ts">
const { t, locale, setLocale } = useI18n();

type Locale = "en" | "ja";

function toggleLocale() {
  const next: Locale = locale.value === "en" ? "ja" : "en";
  setLocale(next);
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <header class="border-b border-border bg-background">
      <nav class="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        <NuxtLink to="/" class="font-semibold hover:text-primary">
          {{ t("nav.home") }}
        </NuxtLink>
        <NuxtLink to="/counter" class="hover:text-primary">{{ t("nav.counter") }}</NuxtLink>
        <NuxtLink to="/users" class="hover:text-primary">{{ t("nav.users") }}</NuxtLink>
        <NuxtLink to="/form" class="hover:text-primary">{{ t("nav.form") }}</NuxtLink>
        <UiButton size="sm" variant="outline" class="ml-auto" @click="toggleLocale">
          {{ locale.toUpperCase() }}
        </UiButton>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-6 py-8">
      <slot />
    </main>
  </div>
</template>
