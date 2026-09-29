<script setup lang="ts">
import { useSocketIO } from "@/composables/useSocketIO";
import { useSocketIOStore } from "@/stores/socket-io";

// Opens the realtime socket for as long as it is mounted; the layout renders it
// (client-only) while signed in, so signing out unmounts it and closes the socket.
useSocketIO();

const { t } = useI18n();

const { ioStore } = storeToRefs(useSocketIOStore());

const label = computed(() =>
  ioStore.value.authenticated ? t("socket.connected") : t("socket.reconnecting"),
);
</script>

<template>
  <span role="status" :title="label" class="inline-flex items-center">
    <span
      aria-hidden="true"
      :class="
        cn('size-2 rounded-full', ioStore.authenticated ? 'bg-emerald-500' : 'bg-muted-foreground')
      "
    />
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
