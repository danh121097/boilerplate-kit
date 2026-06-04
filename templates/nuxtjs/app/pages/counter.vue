<script setup lang="ts">
import { useCounterStore } from "@/stores/counter";

const { t } = useI18n();
const counter = useCounterStore();
</script>

<template>
  <section>
    <h1 class="mb-4 text-3xl font-bold">{{ t("counter.title") }}</h1>
    <p class="mb-4 text-lg">
      {{ t("counter.count") }}:
      <span class="font-mono">{{ counter.count }}</span>
    </p>
    <div class="flex gap-2">
      <UiButton variant="secondary" size="sm" @click="counter.decrement">−</UiButton>
      <UiButton variant="secondary" size="sm" @click="counter.increment">+</UiButton>
      <UiButton variant="danger" size="sm" @click="counter.reset">Reset</UiButton>
    </div>
  </section>
</template>
