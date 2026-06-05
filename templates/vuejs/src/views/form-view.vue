<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { z } from "zod";

const { t } = useI18n();

const schema = toTypedSchema(
  z.object({
    email: z.email("Invalid email"),
    password: z.string().min(8, "At least 8 characters"),
  }),
);

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

    <Card class="max-w-md">
      <form class="space-y-4" @submit="onSubmit">
        <VeeInput
          name="email"
          type="email"
          :label="t('form.email')"
          placeholder="you@example.com"
          clearable
        />

        <VeeInput name="password" type="password" :label="t('form.password')" />

        <Button type="submit" block>
          {{ t("form.submit") }}
        </Button>

        <Badge v-if="success" variant="success">{{ t("form.success") }}</Badge>
      </form>
    </Card>
  </section>
</template>
