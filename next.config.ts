import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Carga masiva de productos: el Excel viaja en un server action.
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
