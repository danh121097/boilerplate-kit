<script setup lang="ts">
import { useSocketIO } from "@/composables/useSocketIO";
import { useSocketIOStore } from "@/stores/socket-io";

// Header realtime indicator. Rendered only while signed in: mounting it opens the
// socket, unmounting it (sign-out) destroys it.
const { t } = useI18n();

const { ioStore } = storeToRefs(useSocketIOStore());

useSocketIO();

const label = computed(() =>
  ioStore.value.authenticated ? t("socket.connected") : t("socket.reconnecting"),
);
</script>

<template>
  <span role="status" :title="label" class="inline-flex items-center">
    <span
      :class="
        cn('size-2 rounded-full', ioStore.authenticated ? 'bg-emerald-500' : 'bg-muted-foreground')
      "
      aria-hidden="true"
    />
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
