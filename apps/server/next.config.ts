import path from "node:path"

import { loadEnvConfig } from "@next/env"
/**
 * The server app hosts tRPC routes and background orchestration inside a minimal Next runtime.
 * Keeping config slim here helps us add route handlers without framework-specific surprises.
 */
import type { NextConfig } from "next"

const monorepoRoot = path.resolve(process.cwd(), "../..")
loadEnvConfig(monorepoRoot)

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
}

export default nextConfig
