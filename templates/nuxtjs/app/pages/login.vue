<script setup lang="ts">
import { useLoginMutation, useSessionQuery } from "@/services/auth";
import { getApiErrorMessage } from "@/services/core";
import { safeRedirect } from "@/utils/safe-redirect";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";

const { t } = useI18n();
const route = useRoute();

const queryClient = useQueryClient();

// Where to go once signed in: the page session expiry bounced the user away
// from (`?redirect=`, same-origin paths only), else home.
const redirectTo = computed(() => safeRedirect(route.query.redirect));

// Resolve the session on the server; if already signed in, skip the form.
await queryClient.prefetchQuery(useSessionQuery.queryOptions());
const { data: sessionUser } = useSessionQuery();
if (sessionUser.value) await navigateTo(redirectTo.value);

// The login mutation invalidates `auth.me`; on success the session re-resolves and
// we return to `redirectTo` (the header flips to Logout). No token in JS — cookie-based auth.
const {
  mutate: doLogin,
  isPending,
  error,
} = useLoginMutation({
  onSuccess: () => navigateTo(redirectTo.value),
});

const email = ref("");
const password = ref("");

function onSubmit() {
  doLogin({ email: email.value, password: password.value });
}
</script>

<template>
  <section>
    <h1 class="mb-4 text-3xl font-bold">{{ t("login.title") }}</h1>

    <UiCard class="max-w-md">
      <form class="space-y-4" @submit.prevent="onSubmit">
        <div class="space-y-1">
          <label class="text-sm font-medium">{{ t("login.email") }}</label>
          <UiInput
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="username"
          />
        </div>

        <div class="space-y-1">
          <label class="text-sm font-medium">{{ t("login.password") }}</label>
          <UiInput v-model="password" type="password" autocomplete="current-password" />
        </div>

        <UiButton type="submit" block :disabled="isPending">
          {{ isPending ? t("login.submitting") : t("login.submit") }}
        </UiButton>

        <p v-if="error" class="text-sm text-red-600">
          {{ getApiErrorMessage(error, t("login.error")) }}
        </p>
      </form>
    </UiCard>
  </section>
</template>
