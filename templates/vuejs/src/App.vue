<script setup lang="ts">
import { setLocale } from "@/plugins/i18n";
import { useLogoutMutation } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import SocketStatus from "@/components/socket-status.vue";

const router = useRouter();
const authStore = useAuthStore();
const { locale, t } = useI18n();

const { isAuthenticated, hydrateError, retrying } = storeToRefs(authStore);
// The import itself is gated on the production constant: a production build has no
// badge code at all, not even an inert branch.
const MockAuthBadge = import.meta.env.PROD
  ? null
  : defineAsyncComponent(() => import("@/components/mock-auth-badge.vue"));

onMounted(() => authStore.hydrate());

function toggleLocale() {
  const next = locale.value === "en" ? "ja" : "en";
  setLocale(next);
}

// Settled, not success: navigate even when the server call fails. `AuthModel.logout()`
// already cleared the tokens and ended the session, and the store's session-end
// listener reset the profile and queries, so nothing is cleared again here.
const { mutate: doLogout, isPending: logoutPending } = useLogoutMutation({
  onSettled: async () => {
    await router.push({ name: "login" });
  },
});
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <header class="border-b border-border bg-card">
      <nav class="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        <RouterLink
          to="/"
          class="font-semibold text-muted-foreground hover:text-primary [&.router-link-active]:text-primary"
        >
          {{ t("nav.home") }}
        </RouterLink>
        <RouterLink
          to="/counter"
          class="text-muted-foreground hover:text-primary [&.router-link-active]:text-primary"
          >{{ t("nav.counter") }}</RouterLink
        >
        <RouterLink
          to="/users"
          class="text-muted-foreground hover:text-primary [&.router-link-active]:text-primary"
          >{{ t("nav.users") }}</RouterLink
        >
        <RouterLink
          to="/form"
          class="text-muted-foreground hover:text-primary [&.router-link-active]:text-primary"
          >{{ t("nav.form") }}</RouterLink
        >
        <RouterLink
          v-if="!isAuthenticated"
          to="/login"
          class="ml-auto text-muted-foreground hover:text-primary [&.router-link-active]:text-primary"
        >
          {{ t("nav.login") }}
        </RouterLink>
        <div v-else class="ml-auto flex items-center gap-3">
          <SocketStatus />
          <Button
            variant="unstyled"
            class="text-muted-foreground hover:text-primary"
            :disabled="logoutPending"
            @click="doLogout()"
          >
            {{ t("nav.logout") }}
          </Button>
        </div>
        <Button
          variant="unstyled"
          class="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent"
          @click="toggleLocale"
        >
          {{ locale.toUpperCase() }}
        </Button>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-6 py-8">
      <p
        v-if="hydrateError"
        role="alert"
        class="mb-4 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
      >
        {{ t("session.unavailable") }}
        <Button
          variant="unstyled"
          class="ml-auto underline"
          :disabled="retrying"
          @click="authStore.retryHydrate()"
        >
          {{ t("session.retry") }}
        </Button>
      </p>
      <RouterView />
    </main>
    <MockAuthBadge v-if="MockAuthBadge" />
  </div>
</template>
