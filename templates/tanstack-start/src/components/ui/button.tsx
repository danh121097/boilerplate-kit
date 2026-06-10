import { cn } from "@/utils";
import { LoaderCircle } from "lucide-react";
import { forwardRef, useRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "unstyled";
export type ButtonShape = "rounded" | "square" | "circle";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style — primary (filled), secondary (muted), outline, ghost, danger, or unstyled */
  variant?: ButtonVariant;
  /** Button shape — rounded pill (default), square icon, or circle */
  shape?: ButtonShape;
  /** Size preset — sm | md (default) | lg */
  size?: ButtonSize;
  /** Shows spinner and blocks interaction */
  loading?: boolean;
  /** Stretches button to full container width */
  block?: boolean;
}

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

function rippleEffect(e: React.MouseEvent<HTMLButtonElement>, el: HTMLButtonElement) {
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement("span");
  Object.assign(span.style, {
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
  el.appendChild(span);
  span.addEventListener("animationend", () => span.remove());
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      shape = "rounded",
      size = "md",
      loading = false,
      block = false,
      disabled,
      className,
      children,
      onClick,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLButtonElement>(null);
    const resolvedRef = (ref ?? innerRef) as React.RefObject<HTMLButtonElement>;

    const isDisabled = disabled || loading;
    const isUnstyled = variant === "unstyled";

    const shapeClass =
      shape === "circle"
        ? "rounded-full"
        : shape === "square"
          ? "rounded-md aspect-square px-0"
          : "rounded-md";

    const classes = isUnstyled
      ? className
      : cn(
          "relative inline-flex shrink-0 items-center justify-center gap-2 font-medium transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          "[-webkit-tap-highlight-color:transparent]",
          sizeClasses[size],
          variantClasses[variant],
          shapeClass,
          block && "w-full",
          (loading || isDisabled) && "opacity-60 pointer-events-none",
          className,
        );

    function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
      if (isDisabled) return;
      if (resolvedRef.current) rippleEffect(e, resolvedRef.current);
      onClick?.(e);
    }

    return (
      <button
        ref={resolvedRef}
        type={type}
        disabled={isDisabled}
        className={classes}
        onClick={handleClick}
        {...props}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : children}
      </button>
    );
  },
);

Button.displayName = "Button";
