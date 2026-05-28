<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-3xl font-bold">{{ t("home.welcome") }} 👋</h1>
    <p class="text-(--ui-text-muted)">{{ t("home.description") }}</p>

    <UCard>
      <template #header>
        <p class="font-semibold">Nuxt UI 4 + Tailwind v4</p>
      </template>
      <p class="text-sm text-(--ui-text-muted)">
        Project UI components live in <code>app/components/ui/</code> and
        auto-register globally with the <code>Ui</code> prefix —
        <code>&lt;UiButton&gt;</code>, <code>&lt;UiCard&gt;</code>, etc. Nuxt UI
        ships alongside under the <code>U</code> prefix (<code>&lt;UButton&gt;</code>)
        if you want to opt in for individual primitives.
      </p>
      <template #footer>
        <div class="flex gap-2">
          <UiButton variant="primary">Primary</UiButton>
          <UiButton variant="secondary">Secondary</UiButton>
          <UiButton variant="outline">Outline</UiButton>
        </div>
      </template>
    </UCard>
  </section>
</template>
