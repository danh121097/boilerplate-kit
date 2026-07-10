<script setup lang="ts">
import { setLocale } from "@/plugins/i18n";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();
const { locale, t } = useI18n();

const { isAuthenticated } = storeToRefs(authStore);

onMounted(() => authStore.hydrate());

function toggleLocale() {
  const next = locale.value === "en" ? "ja" : "en";
  setLocale(next);
}

async function onLogout() {
  await authStore.logout();
  router.push({ name: "login" });
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <header class="border-b bg-white">
      <nav class="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        <RouterLink to="/" class="font-semibold hover:text-indigo-600">
          {{ t("nav.home") }}
        </RouterLink>
        <RouterLink to="/counter" class="hover:text-indigo-600">{{ t("nav.counter") }}</RouterLink>
        <RouterLink to="/users" class="hover:text-indigo-600">{{ t("nav.users") }}</RouterLink>
        <RouterLink to="/form" class="hover:text-indigo-600">{{ t("nav.form") }}</RouterLink>
        <RouterLink v-if="!isAuthenticated" to="/login" class="ml-auto hover:text-indigo-600">
          {{ t("nav.login") }}
        </RouterLink>
        <Button v-else variant="unstyled" class="ml-auto hover:text-indigo-600" @click="onLogout">
          {{ t("nav.logout") }}
        </Button>
        <Button
          variant="unstyled"
          class="rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100"
          @click="toggleLocale"
        >
          {{ locale.toUpperCase() }}
        </Button>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
