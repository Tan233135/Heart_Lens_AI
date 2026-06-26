/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the client bundle lean for low-end Android phones on slow 3G (CLAUDE.md §1).
  // Strip the `x-powered-by` header and compress output.
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
