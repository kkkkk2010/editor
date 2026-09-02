/** @type {import('next').NextConfig} */
const isWindows = process.platform === "win32"

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
  images: {
    unoptimized: true,
  },
  experimental: isWindows
    ? {
        webpackBuildWorker: false,
        parallelServerBuildTraces: false,
        parallelServerCompiles: false,
      }
    : {
        webpackBuildWorker: true,
        parallelServerBuildTraces: true,
        parallelServerCompiles: true,
      },
}


export default nextConfig
