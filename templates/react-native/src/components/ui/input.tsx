import { Text } from "@/components/ui/text";
import { cn } from "@/utils";
import { forwardRef } from "react";
import { TextInput, View } from "react-native";
import type { ElementRef } from "react";
import type { TextInputProps } from "react-native";

interface InputProps extends TextInputProps {
  /** Field label rendered above the input. */
  label?: string;
  /** Error message rendered below the input in the destructive color. */
  error?: string;
  /** Extra class for the wrapper View. */
  wrapperClassName?: string;
}

/**
 * Form-integrated text input with an optional label + inline error. Works with
 * react-hook-form via `<Controller>` (RN inputs are not native form elements, so
 * uncontrolled `register` does not apply — see the login screen for the pattern).
 */
export const Input = forwardRef<ElementRef<typeof TextInput>, InputProps>(
  ({ label, error, wrapperClassName, className, ...props }, ref) => {
    return (
      <View className={cn("gap-1", wrapperClassName)}>
        {label ? (
          <Text variant="muted" className={cn(error && "text-destructive")}>
            {label}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor="#9ca3af"
          className={cn(
            "h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground",
            error && "border-destructive",
            className,
          )}
          {...props}
        />
        {error ? <Text variant="error">{error}</Text> : null}
      </View>
    );
  },
);

Input.displayName = "Input";
