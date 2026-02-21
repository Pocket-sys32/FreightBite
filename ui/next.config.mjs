/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3000"
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
