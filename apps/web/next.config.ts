import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ai4a/fiscal-core", "@ai4a/sefaz", "@ai4a/db", "@ai4a/vault"],
};

export default nextConfig;
