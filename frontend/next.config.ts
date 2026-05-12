import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Avoid picking up unrelated lockfiles outside this repo during `next build`.
  outputFileTracingRoot: path.join(__dirname, ".."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.amazonaws.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
