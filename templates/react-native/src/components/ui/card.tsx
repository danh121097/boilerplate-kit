import { cn } from "@/utils";
import { View } from "react-native";
import type { ViewProps } from "react-native";

/** Surface container with border, padding, and a subtle shadow. */
export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("rounded-lg border border-border bg-background p-6 shadow-sm", className)}
      {...props}
    />
  );
}
