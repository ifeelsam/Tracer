import { readFileSync } from "node:fs"
/**
 * The ingest service uses Upstash Redis for caching, rate limiting, and lightweight queues.
 * This module centralizes client creation so route handlers can stay focused on request flow.
 */
import { Redis } from "@upstash/redis"

let redisClient: Redis | null = null

function readSecret(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`]
  if (filePath) {
    return readFileSync(filePath, "utf8").trim()
  }

  return process.env[name]
}

function resolveRedisConfig(): { url: string; token: string } {
  const restUrl = readSecret("UPSTASH_REDIS_REST_URL")
  const restToken = readSecret("UPSTASH_REDIS_REST_TOKEN")
  if (restUrl && restToken) {
    return { url: restUrl, token: restToken }
  }

  const rawUrl = readSecret("REDIS_URL")
  if (!rawUrl) {
    throw new Error("REDIS_URL is required")
  }

  if (rawUrl.startsWith("https://") || rawUrl.startsWith("http://")) {
    const token = readSecret("REDIS_TOKEN") ?? readSecret("UPSTASH_REDIS_REST_TOKEN")
    if (!token) {
      throw new Error(
        "REDIS_TOKEN (or UPSTASH_REDIS_REST_TOKEN) is required when REDIS_URL is HTTP(S)"
      )
    }
    return { url: rawUrl, token }
  }

  if (rawUrl.startsWith("rediss://") || rawUrl.startsWith("redis://")) {
    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      throw new Error("REDIS_URL is not a valid URL")
    }
    const token = decodeURIComponent(parsed.password)
    if (!token) {
      throw new Error("REDIS_URL must include a password/token for Upstash")
    }
    return {
      url: `https://${parsed.hostname}`,
      token,
    }
  }

  throw new Error("REDIS_URL must be an Upstash REST URL or redis/rediss URL")
}

export function getRedis(): Redis {
  if (redisClient) {
    return redisClient
  }

  const config = resolveRedisConfig()

  redisClient = new Redis({
    url: config.url,
    token: config.token,
  })

  return redisClient
}
