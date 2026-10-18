const nextConfig = {
    poweredByHeader: false,

    // Keep Next.js output tracing scoped to this app, not a parent directory
    // that may contain an unrelated package-lock.json.
    outputFileTracingRoot: process.cwd()
};
export default nextConfig;
