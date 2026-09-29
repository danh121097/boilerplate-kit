<script setup lang="ts">
import { loginSchema } from "@/services/auth/login-schema";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";

const { t } = useI18n();

const schema = toTypedSchema(loginSchema);

// Start fields as empty strings so zod's "expected string" check passes — users see
// the format/length validation messages instead of the generic type error.
const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: { email: "", password: "" },
});

const success = ref(false);

const onSubmit = handleSubmit(() => {
  success.value = true;
});
</script>

<template>
  <section>
    <h1 class="mb-4 text-3xl font-bold">{{ t("form.title") }}</h1>

    <UiCard class="max-w-md">
      <form class="space-y-4" novalidate @submit="onSubmit">
        <UiVeeInput
          name="email"
          type="email"
          :label="t('form.email')"
          placeholder="you@example.com"
          clearable
        />

        <UiVeeInput name="password" type="password" :label="t('form.password')" />

        <UiButton type="submit" block>
          {{ t("form.submit") }}
        </UiButton>

        <UiBadge v-if="success" variant="success">{{ t("form.success") }}</UiBadge>
      </form>
    </UiCard>
  </section>
</template>
