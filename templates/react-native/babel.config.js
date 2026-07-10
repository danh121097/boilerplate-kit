// NativeWind v4 + Expo Router babel config.
// - `babel-preset-expo` with `jsxImportSource: "nativewind"` lets className props
//   flow through the NativeWind JSX runtime.
// - `nativewind/babel` is a PRESET in v4 (not a plugin).
// - `react-native-reanimated/plugin` MUST be listed last, or Metro fails to build.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [
      // Enables `static { ... }` class blocks (used by the service Models); not on
      // by default in the preset for the jest/test babel target.
      "@babel/plugin-transform-class-static-block",
      // Reanimated's plugin MUST be listed last, or Metro fails to build.
      "react-native-reanimated/plugin",
    ],
  };
};
