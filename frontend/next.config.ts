import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Persist Turbopack compile cache across `next dev` restarts (faster warm starts).
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  // Hide the Next.js route/dev indicator entirely for the demo UI.
  devIndicators: false,
}

export default nextConfig
