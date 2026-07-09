import { cn } from "@/utils";
import { Text as RNText } from "react-native";
import type { TextProps as RNTextProps } from "react-native";

export type TextVariant = "body" | "title" | "heading" | "muted" | "error";

interface TextProps extends RNTextProps {
  /** Typographic role — maps to a NativeWind class preset. */
  variant?: TextVariant;
}

const variantClasses: Record<TextVariant, string> = {
  body: "text-base text-foreground",
  title: "text-lg font-semibold text-foreground",
  heading: "text-3xl font-bold text-foreground",
  muted: "text-sm text-muted-foreground",
  error: "text-sm text-destructive",
};

/** Themed Text primitive — the base for all copy so colors stay consistent. */
export function Text({ variant = "body", className, ...props }: TextProps) {
  return <RNText className={cn(variantClasses[variant], className)} {...props} />;
}
