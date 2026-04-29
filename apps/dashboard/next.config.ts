/**
 * The dashboard app hosts the primary Tracer product UI and keeps build tracing scoped to this monorepo.
 * Its config stays intentionally light so visual work can happen mostly in app and component files.
 */
import path from "node:path"

import { loadEnvConfig } from "@next/env"
import type { NextConfig } from "next"

const monorepoRoot = path.resolve(process.cwd(), "../..")
loadEnvConfig(monorepoRoot)

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
}

export default nextConfig
