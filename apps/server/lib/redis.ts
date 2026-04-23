/**
 * The server app uses Redis for live coordination, rerun queues, and analysis wakeups.
 * This singleton keeps request handlers from recreating the Upstash client on every call.
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
