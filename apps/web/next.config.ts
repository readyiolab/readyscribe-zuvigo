import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@zuvigo/auth",
    "@zuvigo/config",
    "@zuvigo/core",
    "@zuvigo/db",
    "@zuvigo/logger",
    "@zuvigo/queue",
    "@zuvigo/security",
    "@zuvigo/storage",
    "@zuvigo/types",
    "@zuvigo/ui",
    "@zuvigo/capture",
    "@zuvigo/ai",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/s/:publicId/embed",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
