<script setup lang="ts">
import type { NuxtError } from "#app";

interface Props {
  error: NuxtError;
}

const props = defineProps<Props>();

const { t } = useI18n();

const isNotFound = computed(() => props.error.statusCode === 404);

// Clears the error state and navigates home in one step.
function goHome() {
  return clearError({ redirect: "/" });
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <main class="mx-auto max-w-3xl px-6 py-16">
      <h1 class="mb-3 text-3xl font-bold">
        {{ isNotFound ? t("not_found.title") : t("error.title") }}
      </h1>
      <p v-if="isNotFound" class="mb-6 text-muted-foreground">
        {{ t("not_found.description") }}
      </p>
      <UiButton @click="goHome">
        {{ isNotFound ? t("not_found.back_home") : t("error.back_home") }}
      </UiButton>
    </main>
  </div>
</template>
