/**
 * The enrichment worker publishes trace update signals and reuses Redis for lightweight coordination.
 * Keeping the client singleton here avoids repeated connection setup per webhook request.
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
