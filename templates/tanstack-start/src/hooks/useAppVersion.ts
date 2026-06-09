/**
 * Returns the build version string from the Vite env. Mirrors the reactjs
 * template hook — same VITE_ prefix, same fallback.
 */
export function useAppVersion(): string {
  return import.meta.env.VITE_BUILD_VERSION || "0.0.0";
}
