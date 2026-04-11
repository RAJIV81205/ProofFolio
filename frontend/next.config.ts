import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
      };
      
      // Fix isomorphic-ws for client
      config.resolve.alias = {
        ...config.resolve.alias,
        "isomorphic-ws": path.resolve(__dirname, "ws-stub.js"),
      };
    }
    return config;
  },
};

export default nextConfig;
