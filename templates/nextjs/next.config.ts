import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Silence the workspace root warning when building inside a monorepo.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
