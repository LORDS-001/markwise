import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in the home directory
  // doesn't get picked up as the project root.
  turbopack: { root: __dirname },
  // Keep the dev badge off the sidebar's footer controls.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
