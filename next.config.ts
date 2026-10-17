import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  // Keep Next.js output tracing scoped to this app, not a parent directory
  // that may contain an unrelated package-lock.json.
  outputFileTracingRoot: process.cwd()
};

export default nextConfig;
