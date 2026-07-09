<script setup lang="ts">
import { useLoginMutation } from "@/services/auth/auth";
import { useAuthStore } from "@/stores/auth";
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
    // Return to the page the guard bounced the user away from, else home.
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    await router.replace(redirect);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("login.error");
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
