<script setup lang="ts">
interface Props {
  class?: string;
}

const props = defineProps<Props>();
</script>

<template>
  <div :class="cn('rounded-lg border bg-white p-6 shadow-sm', props.class)">
    <slot />
  </div>
</template>
