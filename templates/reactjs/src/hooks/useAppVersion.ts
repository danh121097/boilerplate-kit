/**
 * Returns the build version string from the Vite env. Mirrors the vuejs
 * composable so the same version badge pattern works in React.
 */
export function useAppVersion(): string {
  return import.meta.env.VITE_BUILD_VERSION || "0.0.0";
}
