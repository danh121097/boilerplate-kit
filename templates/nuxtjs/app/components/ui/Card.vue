<script setup lang="ts">
interface Props {
  class?: string;
}

const props = defineProps<Props>();
</script>

<template>
  <div
    :class="
      cn('rounded-lg border border-border bg-card text-card-foreground p-6 shadow-sm', props.class)
    "
  >
    <slot />
  </div>
</template>
