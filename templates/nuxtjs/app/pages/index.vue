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
        Project ships custom <code>&lt;UiButton&gt;</code>,
        <code>&lt;UiInput&gt;</code>, <code>&lt;UiVeeInput&gt;</code> in
        <code>app/components/ui/</code> — the bits that benefit from a tailored
        design surface. For the rest (Card, Badge, Modal, Toast, …) use Nuxt UI
        stock under the <code>U</code> prefix (<code>&lt;UCard&gt;</code>,
        <code>&lt;UBadge&gt;</code>, …) to avoid reinventing them.
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
