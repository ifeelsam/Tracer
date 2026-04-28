#!/usr/bin/env node
/**
 * Validates runtime URL/port consistency before deploy.
 */

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function parsePort(url) {
  try {
    const parsed = new URL(url)
    if (parsed.port) {
      return Number(parsed.port)
    }
    return parsed.protocol === "https:" ? 443 : 80
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} mismatch: expected ${expected}, got ${actual}`)
  }
}

function main() {
  const serverPort = Number.parseInt(process.env.SERVER_PORT ?? "3001", 10)
  const dashboardPort = Number.parseInt(process.env.DASHBOARD_PORT ?? "3000", 10)
  const ingestPort = Number.parseInt(process.env.INGEST_PORT ?? "4001", 10)

  const dashboardServerUrl = required("NEXT_PUBLIC_TRACER_SERVER_URL")
  const dashboardIngestUrl = required("NEXT_PUBLIC_TRACER_INGEST_URL")

  assertEqual("NEXT_PUBLIC_TRACER_SERVER_URL port", parsePort(dashboardServerUrl), serverPort)
  assertEqual("NEXT_PUBLIC_TRACER_INGEST_URL port", parsePort(dashboardIngestUrl), ingestPort)

  if (dashboardPort === serverPort) {
    throw new Error("DASHBOARD_PORT and SERVER_PORT must be different.")
  }

  console.log("[runtime-config] ok")
}

try {
  main()
} catch (error) {
  console.error("[runtime-config] failed:", error)
  process.exit(1)
}
