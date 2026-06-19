<script setup lang="ts">
import { useField } from "vee-validate";
import type { BaseInputProps } from "@/components/ui/input.props";

interface Props extends BaseInputProps {
  /** Field name — must match the form schema key. */
  name: string;
}

const props = withDefaults(defineProps<Props>(), { type: "text", variant: "default" });

const { errorMessage, value } = useField<string | number>(() => props.name, undefined, {
  validateOnValueUpdate: true,
});

const hasValidationError = computed(() => Boolean(errorMessage.value));
const showError = computed(() => hasValidationError.value || props.error);
</script>

<template>
  <div class="vee-input-wrapper" v-bind="$attrs">
    <UiInput
      v-model="value"
      :label="label"
      :type="type"
      :variant="variant"
      :readonly="readonly"
      :disabled="disabled"
      :placeholder="placeholder"
      :autofocus="autofocus"
      :maxlength="maxlength"
      :center="center"
      :clearable="clearable"
      :mask="mask"
      :input-class="inputClass"
      :error="showError"
      :error-message="errorMessage"
    >
      <template v-if="$slots.prepend" #prepend>
        <slot name="prepend" />
      </template>
      <template v-if="$slots.append" #append>
        <slot name="append" />
      </template>
    </UiInput>
  </div>
</template>
