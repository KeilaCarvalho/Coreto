import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["unpdf"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
