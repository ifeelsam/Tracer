import path from "node:path"

/**
 * The server app hosts tRPC routes and background orchestration inside a minimal Next runtime.
 * Keeping config slim here helps us add route handlers without framework-specific surprises.
 */
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
}

export default nextConfig
