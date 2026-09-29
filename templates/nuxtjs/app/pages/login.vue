<script setup lang="ts">
import { useLoginMutation, useMeQuery } from "@/services/auth";
import { loginSchema } from "@/services/auth/login-schema";
import { getApiErrorMessage, safeRedirect, useServerRenderedQuery } from "@/services/core";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { computed } from "vue";

definePageMeta({ middleware: "guest" });

const { t } = useI18n();
const route = useRoute();

// Where to go once signed in: the page session expiry bounced the user away
// from (`?redirect=`, same-origin paths only), else home.
const redirectTo = computed(() => safeRedirect(route.query.redirect));

// Already signed in → skip the form. The layout resolved the session first, so
// this reads it instead of probing again (on the server, a second probe could
// flip the already-rendered header).
const { data: sessionUser } = useServerRenderedQuery(useMeQuery);
if (sessionUser.value) await navigateTo(redirectTo.value);

// The login mutation invalidates `auth.me`; on success the session re-resolves and
// we return to `redirectTo` (the header flips to Logout). No token in JS — cookie-based auth.
const {
  mutate: doLogin,
  isPending,
  error,
  reset,
} = useLoginMutation({
  onSuccess: () => navigateTo(redirectTo.value),
});

const schema = toTypedSchema(loginSchema);

// Start fields as empty strings so zod's "expected string" check passes — users
// see the format/length messages instead of the generic type error.
const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: { email: "", password: "" },
});

const submit = handleSubmit((values) => doLogin(values));

// A new attempt clears the previous server error, even when it then fails
// client-side validation.
function onSubmit(event: Event) {
  reset();
  return submit(event);
}
</script>

<template>
  <section>
    <h1 class="mb-4 text-3xl font-bold">{{ t("login.title") }}</h1>

    <UiCard class="max-w-md">
      <form class="space-y-4" novalidate @submit="onSubmit">
        <UiVeeInput
          name="email"
          type="email"
          :label="t('login.email')"
          placeholder="you@example.com"
          autocomplete="username"
          clearable
        />

        <UiVeeInput
          name="password"
          type="password"
          :label="t('login.password')"
          autocomplete="current-password"
        />

        <UiButton type="submit" block :disabled="isPending">
          {{ isPending ? t("login.submitting") : t("login.submit") }}
        </UiButton>

        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ getApiErrorMessage(error, t("login.error")) }}
        </p>
      </form>
    </UiCard>
  </section>
</template>
