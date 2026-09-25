<script setup lang="ts">
import { useLoginMutation } from "@/services/auth/auth";
import { getApiErrorMessage } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import { safeRedirect } from "@/utils/safe-redirect";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { z } from "zod";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { mutateAsync, isPending } = useLoginMutation();

const schema = toTypedSchema(
  z.object({
    email: z.email("Invalid email"),
    password: z.string().min(8, "At least 8 characters"),
  }),
);

// Start fields as empty strings so zod's "expected string" check passes — users
// see the format/length messages instead of the generic type error.
const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: { email: "", password: "" },
});

const error = ref("");

const onSubmit = handleSubmit(async (values) => {
  error.value = "";
  try {
    const result = await mutateAsync(values);
    authStore.setUser(result.user);
    // Return to the page the guard bounced the user away from (same-origin
    // paths only), else home.
    await router.replace(safeRedirect(route.query.redirect));
  } catch (err) {
    // Rejections are `ApiResponseError` objects — show the server's message
    // (e.g. "Invalid credentials" on a 401), falling back to the generic text.
    error.value = getApiErrorMessage(err, t("login.error"));
  }
});
</script>

<template>
  <section>
    <h1 class="mb-4 text-3xl font-bold">{{ t("login.title") }}</h1>

    <Card class="max-w-md">
      <form class="space-y-4" @submit="onSubmit">
        <VeeInput
          name="email"
          type="email"
          :label="t('login.email')"
          placeholder="you@example.com"
          clearable
        />

        <VeeInput name="password" type="password" :label="t('login.password')" />

        <Button type="submit" block :disabled="isPending">
          {{ isPending ? t("login.submitting") : t("login.submit") }}
        </Button>

        <Badge v-if="error" variant="danger">{{ error }}</Badge>
      </form>
    </Card>
  </section>
</template>
