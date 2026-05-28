<script setup lang="ts">
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";

const { t } = useI18n();

const schema = toTypedSchema(
  z.object({
    email: z.email("Invalid email"),
    password: z.string().min(8, "At least 8 characters"),
  }),
);

const { handleSubmit, meta } = useForm({
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
      <form class="space-y-4" @submit="onSubmit">
        <UiVeeInput
          name="email"
          type="email"
          :label="t('form.email')"
          placeholder="you@example.com"
          clearable
        />
        <UiVeeInput name="password" type="password" :label="t('form.password')" />

        <UiButton type="submit" :disabled="!meta.valid" block>
          {{ t("form.submit") }}
        </UiButton>

        <UiBadge v-if="success" variant="success">{{ t("form.success") }}</UiBadge>
      </form>
    </UiCard>
  </section>
</template>
