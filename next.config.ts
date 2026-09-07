import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in the home directory
  // doesn't get picked up as the project root.
  turbopack: { root: __dirname },
  // Saving an already-computed run includes model annotations. The action
  // validates at 4 MiB; leave 20 KiB for the multipart transport envelope.
  experimental: { serverActions: { bodySizeLimit: 4 * 1024 * 1024 + 20 * 1024 } },
  // Keep the dev badge off the sidebar's footer controls.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
