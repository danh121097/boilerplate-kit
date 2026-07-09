// Metro config wired for NativeWind v4. `withNativeWind` injects the CSS-to-RN
// transform; `input` points at the Tailwind entry stylesheet.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/styles/global.css" });
