<script setup lang="ts">
import { isMockAuthEnabled } from "@/services/auth/data/mock-auth";

// Dev signal: a small amber pill at the bottom-left while mock auth is active,
// nothing otherwise. `layouts/default.vue` loads this file only outside
// production builds, so it never ships.
</script>

<template>
  <span
    v-if="isMockAuthEnabled()"
    role="status"
    title="NUXT_PUBLIC_AUTH_MOCK is on: auth and users are answered by the mock, not the backend"
    class="fixed bottom-3 left-3 z-50 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300"
  >
    Mock auth
  </span>
</template>
