<script setup lang="ts">
import { LoaderCircle } from "lucide-vue-next";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "unstyled";
export type ButtonShape = "rounded" | "square" | "circle";
export type ButtonSize = "sm" | "md" | "lg";

interface Props {
  /** Visual style — primary (filled), secondary (muted), outline, ghost, danger, or unstyled (bare wrapper) */
  variant?: ButtonVariant;
  /** Button shape — rounded pill (default), square icon, or circle */
  shape?: ButtonShape;
  /** Size preset — sm | md (default) | lg */
  size?: ButtonSize;
  /** Disables interaction and dims opacity */
  disabled?: boolean;
  /** Shows spinner and blocks interaction */
  loading?: boolean;
  /** Stretches button to full container width */
  block?: boolean;
  /** Native button type — defaults to "button" so it doesn't accidentally submit forms */
  type?: "button" | "submit" | "reset";
}

interface Emits {
  (e: "click", event: MouseEvent): void;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "primary",
  shape: "rounded",
  size: "md",
  type: "button",
});

const emits = defineEmits<Emits>();

const innerRef = useTemplateRef<HTMLElement>("innerRef");

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
  ghost: "bg-transparent hover:bg-accent hover:text-accent-foreground",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  unstyled: "",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const isUnstyled = computed(() => props.variant === "unstyled");
const isDisabled = computed(() => props.disabled || props.loading);

const shapeClasses = computed(() => {
  if (props.shape === "circle") return "rounded-full";
  if (props.shape === "square") return "rounded-md aspect-square px-0";
  return "rounded-md";
});

const outerClasses = computed(() =>
  cn(
    "relative inline-flex shrink-0 items-center justify-center gap-2 font-medium transition-colors",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[-webkit-tap-highlight-color:transparent]",
    sizeClasses[(props.size ?? "md") as ButtonSize],
    variantClasses[(props.variant ?? "primary") as ButtonVariant],
    shapeClasses.value,
    props.block && "w-full",
    (props.loading || isDisabled.value) && "opacity-60 pointer-events-none",
  ),
);

function handleClick(e: MouseEvent) {
  if (isDisabled.value) return;
  rippleEffect(e);
  emits("click", e);
}

function rippleEffect(e: MouseEvent) {
  const el = innerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const ripple = document.createElement("span");
  const size = Math.max(rect.width, rect.height);
  Object.assign(ripple.style, {
    position: "absolute",
    width: `${size}px`,
    height: `${size}px`,
    left: `${e.clientX - rect.left - size / 2}px`,
    top: `${e.clientY - rect.top - size / 2}px`,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.35)",
    transform: "scale(0)",
    animation: "ripple 0.5s ease-out forwards",
    pointerEvents: "none",
  });
  el.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
}

onBeforeUnmount(() => {
  innerRef.value?.querySelectorAll('span[style*="animation"]').forEach((el) => el.remove());
});
</script>

<template>
  <component
    :is="isUnstyled ? 'div' : 'button'"
    ref="innerRef"
    :class="isUnstyled ? undefined : outerClasses"
    :type="isUnstyled ? undefined : props.type"
    :disabled="isUnstyled ? undefined : isDisabled"
    @click="handleClick"
  >
    <template v-if="isUnstyled">
      <slot />
    </template>
    <template v-else>
      <LoaderCircle v-if="loading" class="size-4 animate-spin" aria-hidden />
      <slot v-else />
    </template>
  </component>
</template>

<style scoped lang="scss">
@keyframes ripple {
  to {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
