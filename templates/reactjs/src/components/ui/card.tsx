import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div className={cn("rounded-lg border bg-white p-6 shadow-sm", className)} {...props} />;
}
