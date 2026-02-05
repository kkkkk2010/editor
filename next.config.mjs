/** @type {import('next').NextConfig} */
const isWindows = process.platform === "win32"

const nextConfig = {
  output: "standalone",
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
