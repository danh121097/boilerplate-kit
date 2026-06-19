<script setup lang="ts">
import { badgeVariants } from "@/components/ui/badge.variants";

type Variant = "default" | "secondary" | "success" | "warning" | "danger";

interface Props {
  variant?: Variant;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), { variant: "default" });
</script>

<template>
  <span :class="cn(badgeVariants({ variant: props.variant }), props.class)">
    <slot />
  </span>
</template>
