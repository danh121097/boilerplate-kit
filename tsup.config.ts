import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  outExtension: () => ({ js: ".mjs" }),
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
  minify: false,
  shims: false,
  treeshake: true,
  banner: { js: "#!/usr/bin/env node" },
});
