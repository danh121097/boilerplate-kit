import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combine class strings, dedupe Tailwind conflicts, and skip falsy values.
 * Use as: `:class="cn('base', condition && 'extra', props.class)"`
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
