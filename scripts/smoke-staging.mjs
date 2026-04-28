#!/usr/bin/env node
/**
 * Staging smoke checks used as a deploy gate.
 * Verifies that ingest, server, and dashboard are reachable over their public URLs.
 */

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

async function check(url, name) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6_000) })
  if (!response.ok) {
    throw new Error(`${name} check failed (${response.status}) at ${url}`)
  }
}

async function main() {
  const ingest = requiredEnv("STAGING_INGEST_URL")
  const server = requiredEnv("STAGING_SERVER_URL")
  const dashboard = requiredEnv("STAGING_DASHBOARD_URL")

  console.log("[staging-smoke] checking ingest /healthz")
  await check(`${ingest}/healthz`, "ingest")

  console.log("[staging-smoke] checking server /api/trpc/chains.getActive")
  await check(`${server}/api/trpc/chains.getActive`, "server")

  console.log("[staging-smoke] checking dashboard /")
  await check(`${dashboard}/`, "dashboard")

  console.log("[staging-smoke] ok")
}

main().catch((error) => {
  console.error("[staging-smoke] failed:", error)
  process.exit(1)
})
