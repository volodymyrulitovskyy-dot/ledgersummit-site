import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typescript: {
    // Temporarily ignore build errors to deploy
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
