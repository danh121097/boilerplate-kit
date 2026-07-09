/**
 * Returns the build version string from the Expo env. Mirrors the web template's
 * composable so the same version badge pattern works on React Native.
 */
export function useAppVersion(): string {
  return process.env.EXPO_PUBLIC_BUILD_VERSION || "0.0.0";
}
