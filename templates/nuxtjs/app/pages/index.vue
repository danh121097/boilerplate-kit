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
        Nuxt UI components ship globally with the <code>U</code> prefix
        (<code>&lt;UButton&gt;</code>, <code>&lt;UCard&gt;</code>, ...). Project
        components in <code>app/components/ui/</code> auto-register without a prefix
        (<code>&lt;Button&gt;</code>, <code>&lt;Card&gt;</code>, ...).
      </p>
      <template #footer>
        <div class="flex gap-2">
          <UButton color="primary">Nuxt UI Button</UButton>
          <Button variant="secondary">Project Button</Button>
        </div>
      </template>
    </UCard>
  </section>
</template>
