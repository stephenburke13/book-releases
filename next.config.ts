import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared core in src/ uses NodeNext-style ".js" import specifiers that
  // actually point at ".ts" files. Teach the bundler to resolve them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
};

export default nextConfig;

// Make Cloudflare bindings (D1, secrets) available during `next dev` via
// getCloudflareContext(), matching the deployed Worker.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
