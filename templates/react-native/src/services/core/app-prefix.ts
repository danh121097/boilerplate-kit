import { APP_PREFIX } from "@/enums";

/**
 * The app-name prefix every persisted key shares (`${prefix}_ACCESS_TOKEN`,
 * `${prefix}_REFRESH_TOKEN`, ...). Sanitized at build time from
 * `EXPO_PUBLIC_APP_NAME` so it is always SecureStore-legal; defaults to
 * `PRISM_APP`. Use it when registering extra services' token slots.
 */
export function getAppPrefix(): string {
  return APP_PREFIX;
}
