import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker + clustering
  // Creates a minimal production build in .next/standalone
  output: "standalone",
};

export default nextConfig;
