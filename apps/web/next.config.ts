import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so workspace packages (e.g. @repo/shared)
  // are included in the standalone build output.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
