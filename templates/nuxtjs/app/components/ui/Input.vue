<script setup lang="ts">
import { Eye, EyeOff, Search, X } from "lucide-vue-next";
import type { BaseInputProps, InputType, InputVariant } from "@/components/ui/input.props";

interface Props extends BaseInputProps {
  /** v-model value. */
  modelValue?: string | number;
  /** Helper message rendered under the input. Red styling when `error` is true. */
  errorMessage?: string;
}

interface Emits {
  (e: "update:modelValue", value: string | number): void;
  (e: "focus" | "blur", event: FocusEvent): void;
}

const props = withDefaults(defineProps<Props>(), {
  type: "text",
  variant: "default",
});

const emits = defineEmits<Emits>();

const inputRef = useTemplateRef<HTMLInputElement>("inputRef");

const variantClasses: Record<InputVariant, string> = {
  default: "bg-background border-input",
  filled: "bg-secondary border-transparent",
};

const focused = ref(false);
const currentType = ref<InputType>(props.type);

const hasValue = computed(
  () => props.modelValue !== undefined && props.modelValue !== "" && props.modelValue !== null,
);
const isFloating = computed(() => focused.value || hasValue.value);

const showPasswordToggle = computed(() => props.type === "password");
const showSearchIcon = computed(() => props.type === "search");
const showClear = computed(() => props.clearable && hasValue.value);

const containerClasses = computed(() =>
  cn(
    "relative h-12 rounded-md border transition-colors duration-150",
    variantClasses[(props.variant ?? "default") as InputVariant],
    focused.value && "border-ring",
    props.error && "!border-destructive",
    props.disabled && "opacity-50 pointer-events-none",
  ),
);

function applyMask(value: string, masks: string | string[]) {
  const digits = value.replace(/\D/g, "");
  const list = Array.isArray(masks) ? masks : [masks];
  const sorted = [...list].sort((a, b) => a.length - b.length);
  const mask =
    sorted.find((m) => m.replace(/[^#]/g, "").length >= digits.length) ??
    sorted[sorted.length - 1]!;
  let result = "";
  let i = 0;
  for (let j = 0; j < mask.length && i < digits.length; j++) {
    if (mask[j] === "#") result += digits[i++];
    else result += mask[j];
  }
  return result;
}

function clear() {
  emits("update:modelValue", "");
  inputRef.value?.focus();
}

function showPassword() {
  currentType.value = "text";
}
function hidePassword() {
  currentType.value = "password";
}

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement;
  if (props.type === "tel") target.value = target.value.replace(/[^\d\s+\-()]/g, "");
  if (props.type === "number") {
    if (target.value === "") return emits("update:modelValue", "");
    const num = Number(target.value);
    return emits("update:modelValue", Number.isNaN(num) ? target.value : num);
  }
  if (props.mask) {
    const masked = applyMask(target.value, props.mask);
    target.value = masked;
    return emits("update:modelValue", masked);
  }
  emits("update:modelValue", target.value);
}

function handleFocus(e: FocusEvent) {
  focused.value = true;
  emits("focus", e);
}
function handleBlur(e: FocusEvent) {
  focused.value = false;
  emits("blur", e);
}

onMounted(async () => {
  if (!props.autofocus) return;
  await nextTick();
  inputRef.value?.focus();
});
</script>

<template>
  <div>
    <div :class="containerClasses">
      <label
        v-if="label"
        :class="
          cn(
            'absolute transition-all duration-150 pointer-events-none select-none text-muted-foreground',
            $slots.prepend ? 'left-12' : 'left-4',
            isFloating ? 'top-1.5 text-xs' : 'top-1/2 -translate-y-1/2 text-sm',
            center && !isFloating && 'left-1/2 -translate-x-1/2',
            error && 'text-destructive!',
          )
        "
      >
        {{ label }}
      </label>

      <input
        ref="inputRef"
        :type="currentType"
        :value="modelValue"
        :readonly="readonly"
        :disabled="disabled"
        :placeholder="isFloating ? placeholder : ''"
        :maxlength="maxlength"
        :inputmode="type === 'tel' || type === 'number' ? 'numeric' : undefined"
        :class="
          cn(
            'absolute inset-0 w-full h-full bg-transparent text-foreground text-sm outline-none rounded-md appearance-none',
            $slots.prepend ? 'pl-16 pr-4' : 'px-4',
            label && isFloating ? 'pt-4 pb-1' : '',
            center && 'text-center',
            error && 'text-destructive!',
            inputClass,
          )
        "
        v-bind="$attrs"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
      />

      <button
        v-if="showPasswordToggle"
        type="button"
        aria-label="Toggle password visibility"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabindex="-1"
        @pointerdown.prevent="showPassword"
        @pointerup="hidePassword"
        @pointerleave="hidePassword"
      >
        <Eye v-if="currentType === 'password'" :size="16" />
        <EyeOff v-else :size="16" />
      </button>

      <button
        v-if="showClear"
        type="button"
        class="absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors z-10"
        :class="showSearchIcon ? 'right-8' : 'right-3'"
        tabindex="-1"
        @click="clear"
      >
        <X :size="14" />
      </button>

      <div
        v-if="showSearchIcon"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <Search :size="16" />
      </div>

      <div v-if="$slots.prepend" class="absolute left-3 top-1/2 -translate-y-1/2">
        <slot name="prepend" />
      </div>
      <div v-if="$slots.append" class="absolute right-3 top-1/2 -translate-y-1/2">
        <slot name="append" />
      </div>
    </div>

    <p v-if="error && errorMessage" class="mt-1 text-xs text-destructive" v-html="errorMessage" />
  </div>
</template>

<style scoped>
input {
  -webkit-appearance: none;
  -moz-appearance: none;
}

input[type="search"]::-webkit-search-cancel-button,
input[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
  display: none;
}
</style>
