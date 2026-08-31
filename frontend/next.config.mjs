/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a minimal standalone server bundle for a small production container.
  // Enabled in the Docker build (BUILD_STANDALONE=1); skipped for local
  // `pnpm build` on Windows, where the standalone copy step needs symlink
  // privileges that aren't available by default.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
