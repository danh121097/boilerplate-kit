import { Input } from "@/components/ui/input";
import type { InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Floating label text. */
  label?: string;
  /** Error message rendered below the input in red. */
  error?: string;
  /** Extra class for the wrapper div. */
  wrapperClassName?: string;
}

/**
 * Form-integrated input with label and inline error message.
 * Wraps <Input> and integrates with react-hook-form via forwardRef.
 */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, wrapperClassName, className, id: idProp, ...props }, ref) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;

    return (
      <div className={cn("space-y-1", wrapperClassName)}>
        {label && (
          <label
            htmlFor={id}
            className={cn("block text-sm font-medium text-foreground", error && "text-destructive")}
          >
            {label}
          </label>
        )}
        <Input
          ref={ref}
          id={id}
          className={cn(error && "border-destructive focus-visible:ring-destructive", className)}
          {...props}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  },
);

FormField.displayName = "FormField";
