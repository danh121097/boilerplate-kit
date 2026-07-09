import type { Config } from "jest";

/**
 * jest-expo preset — the only deliberate divergence from the web templates'
 * vitest. It sets up the React Native module map + Babel transform. Loaded as TS
 * via ts-node (see devDependencies).
 */
const config: Config = {
  preset: "jest-expo",
  // Only *.test.* files are suites — helpers under __tests__/helpers/ are shared
  // fixtures, not tests.
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: [
    // `\\.pnpm` is allow-listed first so pnpm's `.pnpm/` virtual-store segment is
    // skipped and the regex falls through to the real package name in the nested
    // `node_modules/` — otherwise RN/Expo's Flow-typed files never get transformed.
    "node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop|@tanstack/.*))",
  ],
};

export default config;
