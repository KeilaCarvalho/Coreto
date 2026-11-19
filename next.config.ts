import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["unpdf"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Volta para uma tela já vista sem esperar o servidor (salvar algo atualiza na hora).
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
