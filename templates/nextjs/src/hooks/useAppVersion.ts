/**
 * Returns the build version string from the Next.js public env.
 * Mirrors the reactjs composable so the same version badge pattern works.
 */
export function useAppVersion(): string {
  return process.env.NEXT_PUBLIC_BUILD_VERSION || "0.0.0";
}
