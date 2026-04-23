/**
 * The ingest service uses Upstash Redis for caching, rate limiting, and lightweight queues.
 * This module centralizes client creation so route handlers can stay focused on request flow.
 */
import { Redis } from "@upstash/redis"

let redisClient: Redis | null = null

export function getRedis(): Redis {
  if (redisClient) {
    return redisClient
  }

  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error("REDIS_URL is required")
  }

  redisClient = new Redis({
    url,
    token: url.startsWith("rediss://") ? url.slice("rediss://".length) : url,
  })

  return redisClient
}
