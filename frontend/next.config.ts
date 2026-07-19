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
        // Generated contract lives outside frontend and otherwise resolves
        // Midnight runtime classes from root/node_modules. Keep one runtime
        // instance in browser bundle; class identity matters for ledger-v8.
        "@midnight-ntwrk/compact-runtime": path.resolve(
          __dirname,
          "node_modules/@midnight-ntwrk/compact-runtime/dist/index.js",
        ),
        "@midnight-ntwrk/onchain-runtime-v3": path.resolve(
          __dirname,
          "node_modules/@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js",
        ),
        "@midnight-ntwrk/ledger-v8": path.resolve(
          __dirname,
          "node_modules/@midnight-ntwrk/ledger-v8/midnight_ledger_wasm.js",
        ),
      };
    }
    return config;
  },
  devIndicators: false
};

export default nextConfig;
