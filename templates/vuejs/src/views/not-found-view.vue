<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <section>
    <h1 class="mb-3 text-3xl font-bold">{{ t("not_found.title") }}</h1>
    <p class="mb-6 text-muted-foreground">{{ t("not_found.description") }}</p>
    <RouterLink to="/" class="font-medium underline hover:text-primary">
      {{ t("not_found.back_home") }}
    </RouterLink>
  </section>
</template>
