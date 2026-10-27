import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  transpilePackages: ["@ai4a/fiscal-core", "@ai4a/sefaz", "@ai4a/db", "@ai4a/vault"],
};

export default nextConfig;
