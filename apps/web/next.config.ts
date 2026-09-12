import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The development route indicator obscures interactive UI while reviewing
  // the site locally. Compile and runtime errors remain available in the
  // terminal and browser overlay.
  devIndicators: false,
  images: {
    qualities: [75, 88],
  },
  // Trace files from the monorepo root so workspace packages (e.g. @repo/shared)
  // are included in the standalone build output.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
