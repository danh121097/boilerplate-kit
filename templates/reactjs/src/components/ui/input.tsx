import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Extra class applied to the wrapper div. */
  wrapperClassName?: string;
}

/**
 * Base input — unstyled wrapper around a native <input> with Tailwind tokens.
 * For form-integrated use with error display, prefer <FormField>.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, wrapperClassName: _wrapperClassName, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
