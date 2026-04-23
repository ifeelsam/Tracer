/**
 * The anchor worker uses Redis as a lightweight queue for traces awaiting on-chain commitment.
 * Centralizing the client here keeps the polling loop focused on anchoring logic.
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
