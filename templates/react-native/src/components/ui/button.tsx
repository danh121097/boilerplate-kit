import { cn } from "@/utils";
import { forwardRef } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import type { ElementRef } from "react";
import type { PressableProps } from "react-native";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children"> {
  /** Visual style — primary (filled), secondary, outline, ghost, or danger. */
  variant?: ButtonVariant;
  /** Size preset — sm | md (default) | lg. */
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean;
  /** Stretches the button to the full container width. */
  block?: boolean;
  /** Button label. */
  children?: string;
}

const containerVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary active:bg-primary/90",
  secondary: "bg-secondary active:bg-secondary/80",
  outline: "border border-input bg-transparent active:bg-accent",
  ghost: "bg-transparent active:bg-accent",
  danger: "bg-destructive active:bg-destructive/90",
};

const labelVariants: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  danger: "text-destructive-foreground",
};

const sizeContainer: Record<ButtonSize, string> = {
  sm: "h-9 px-3",
  md: "h-11 px-4",
  lg: "h-12 px-6",
};

const sizeLabel: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/** NativeWind Pressable button with variant/size presets and a loading state. */
export const Button = forwardRef<ElementRef<typeof Pressable>, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      block = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <Pressable
        ref={ref}
        disabled={isDisabled}
        accessibilityRole="button"
        className={cn(
          "flex-row items-center justify-center gap-2 rounded-md",
          sizeContainer[size],
          containerVariants[variant],
          block && "w-full",
          isDisabled && "opacity-50",
          className,
        )}
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text className={cn("font-medium", labelVariants[variant], sizeLabel[size])}>
            {children}
          </Text>
        )}
      </Pressable>
    );
  },
);

Button.displayName = "Button";
