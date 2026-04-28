/**
 * The enrichment app consumes Alchemy webhooks and fills in EVM transaction details after confirmation.
 * It updates stored event payloads in place and emits a ready signal once enrichment completes.
 */
import { type Prisma, prisma } from "@tracerlabs/db"
import Fastify from "fastify"
import { z } from "zod"

import { extractWebhookHashes, getExpectedWebhookToken, isAuthorizedWebhook } from "./lib/alchemy"
import { getPublicClient } from "./lib/chains"
import { decodeKnownLogs } from "./lib/decode"
import { getRedis } from "./lib/redis"
import { alchemyWebhookSchema } from "./schemas"

interface ReceiptLogLike {
  address: string
  topics: readonly `0x${string}`[]
  data: `0x${string}`
}

interface EnrichmentRetryItem {
  eventId: string
  traceId: string
  txHash: string
  chainId: number
}

const ENRICHMENT_RETRY_QUEUE = "enrichment:pending"
const ENRICHMENT_DLQ_QUEUE = "enrichment:dlq"

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function getMetricKey(name: string): string {
  return `metrics:enrichment-worker:${name}`
}

function backoffMs(attempts: number): number {
  const maxDelayMs = 10 * 60 * 1_000
  return Math.min(maxDelayMs, 1_000 * 2 ** Math.max(0, attempts - 1))
}

function getRetryStateKey(eventId: string): string {
  return `enrichment:retry:${eventId}`
}

async function incrementMetric(name: string, delta = 1): Promise<void> {
  const redis = getRedis()
  await redis.incrby(getMetricKey(name), delta)
}

async function publishAlert(message: string, metadata: Record<string, unknown>): Promise<void> {
  const redis = getRedis()
  await redis.publish(
    "alerts:ops",
    JSON.stringify({
      service: "enrichment-worker",
      severity: "high",
      message,
      metadata,
      timestamp: Date.now(),
    })
  )
}

async function clearRetryState(eventId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(getRetryStateKey(eventId))
}

async function shouldRetryNow(eventId: string): Promise<boolean> {
  const redis = getRedis()
  const raw = await redis.get<string>(getRetryStateKey(eventId))
  if (!raw) {
    return true
  }
  try {
    const parsed = JSON.parse(raw) as { retryAtMs?: number }
    if (typeof parsed.retryAtMs !== "number") {
      return true
    }
    return parsed.retryAtMs <= Date.now()
  } catch {
    return true
  }
}

async function scheduleRetry(item: EnrichmentRetryItem, reason: string): Promise<void> {
  const redis = getRedis()
  const maxAttempts = Number.parseInt(process.env.ENRICHMENT_MAX_RETRIES ?? "6", 10)
  const stateRaw = await redis.get<string>(getRetryStateKey(item.eventId))
  let attempts = 1
  if (stateRaw) {
    try {
      const parsed = JSON.parse(stateRaw) as { attempts?: number }
      attempts = (parsed.attempts ?? 0) + 1
    } catch {
      attempts = 1
    }
  }

  if (attempts >= maxAttempts) {
    await redis.lpush(
      ENRICHMENT_DLQ_QUEUE,
      JSON.stringify({
        ...item,
        reason,
        attempts,
        failedAt: Date.now(),
      })
    )
    await clearRetryState(item.eventId)
    await incrementMetric("dlq_total")
    await publishAlert("Moved enrichment event to DLQ after max retries.", {
      eventId: item.eventId,
      traceId: item.traceId,
      txHash: item.txHash,
      attempts,
      reason,
    })
    return
  }

  await redis.set(
    getRetryStateKey(item.eventId),
    JSON.stringify({
      attempts,
      retryAtMs: Date.now() + backoffMs(attempts),
    })
  )
  await redis.lpush(ENRICHMENT_RETRY_QUEUE, JSON.stringify(item))
  await incrementMetric("retry_total")
}

function enrichPayloadWithReceipt(
  payload: Record<string, unknown>,
  receipt: {
    blockNumber: bigint
    gasUsed: bigint
    status: "success" | "reverted"
    logs: ReceiptLogLike[]
  }
) {
  const decoded = decodeKnownLogs(receipt.logs)

  return {
    ...payload,
    gasUsed: receipt.gasUsed.toString(),
    blockNumber: Number(receipt.blockNumber),
    status: receipt.status,
    logs: decoded.logs,
    tokenTransfers: decoded.tokenTransfers,
    revertReason: payload.revertReason ?? null,
  }
}

export function buildApp() {
  const expectedWebhookToken = getExpectedWebhookToken()
  const requireWebhookAuth = (process.env.ENRICHMENT_REQUIRE_WEBHOOK_AUTH ?? "true") !== "false"
  if (requireWebhookAuth && !expectedWebhookToken) {
    throw new Error(
      "ALCHEMY_WEBHOOK_AUTH_TOKEN (or ALCHEMY_WEBHOOK_AUTH_TOKEN_FILE) is required when ENRICHMENT_REQUIRE_WEBHOOK_AUTH is enabled."
    )
  }

  const app = Fastify({
    logger: false,
  })

  const enrichTraceEvent = async (event: {
    id: string
    traceId: string
    payload: unknown
  }): Promise<boolean> => {
    const payload = event.payload
    if (
      !payload ||
      typeof payload !== "object" ||
      !("hash" in payload) ||
      typeof payload.hash !== "string"
    ) {
      return false
    }

    const chainId =
      "chainId" in payload && typeof payload.chainId === "number" ? payload.chainId : null
    if (chainId === null) {
      return false
    }

    const publicClient = getPublicClient(chainId)
    const receipt = await publicClient.getTransactionReceipt({
      hash: payload.hash as `0x${string}`,
    })
    const enrichedPayload = enrichPayloadWithReceipt(payload, {
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      status: receipt.status,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
      })),
    })

    await prisma.traceEvent.update({
      where: {
        id: event.id,
      },
      data: {
        payload: toJsonValue(enrichedPayload),
      },
    })

    const redis = getRedis()
    await redis.publish(
      `enrichment:ready:${event.traceId}`,
      JSON.stringify({ traceId: event.traceId })
    )
    await clearRetryState(event.id)
    await incrementMetric("processed_total")
    return true
  }

  const processRetryQueue = async () => {
    const redis = getRedis()
    const retryDepth = await redis.llen(ENRICHMENT_RETRY_QUEUE)
    const lagAlertThreshold = Number.parseInt(process.env.ENRICHMENT_QUEUE_ALERT_DEPTH ?? "200", 10)
    await redis.set(getMetricKey("retry_depth"), retryDepth)
    if (retryDepth >= lagAlertThreshold) {
      await publishAlert("Enrichment retry queue lag exceeds configured threshold.", { retryDepth })
    }
    const raw = await redis.rpop<string>(ENRICHMENT_RETRY_QUEUE)
    if (!raw) {
      return
    }

    let item: EnrichmentRetryItem | null = null
    try {
      item = JSON.parse(raw) as EnrichmentRetryItem
    } catch {
      return
    }
    if (!item) {
      return
    }

    const retryNow = await shouldRetryNow(item.eventId)
    if (!retryNow) {
      await redis.lpush(ENRICHMENT_RETRY_QUEUE, JSON.stringify(item))
      return
    }

    const event = await prisma.traceEvent.findUnique({
      where: { id: item.eventId },
      select: { id: true, traceId: true, payload: true },
    })
    if (!event) {
      await clearRetryState(item.eventId)
      return
    }

    try {
      await enrichTraceEvent(event)
    } catch (error) {
      await scheduleRetry(item, error instanceof Error ? error.message : "unknown_error")
    }
  }

  const retryInterval = setInterval(
    () => {
      void processRetryQueue()
    },
    Number.parseInt(process.env.ENRICHMENT_RETRY_POLL_MS ?? "5000", 10)
  )

  app.addHook("onClose", async () => {
    clearInterval(retryInterval)
  })

  app.post("/webhook/alchemy", async (request, reply) => {
    const authorized = isAuthorizedWebhook(request.headers as Record<string, unknown>)
    if (!authorized) {
      return reply.status(401).send({
        error: "unauthorized",
      })
    }

    const parsedBody = alchemyWebhookSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_request",
        issues: parsedBody.error.flatten(),
      })
    }

    const hashes = extractWebhookHashes(parsedBody.data)
    if (hashes.length === 0) {
      return reply.status(202).send({
        updated: 0,
      })
    }

    const events = await prisma.traceEvent.findMany({
      where: {
        type: "evm_tx",
      },
      select: {
        id: true,
        traceId: true,
        payload: true,
      },
    })

    let updatedCount = 0

    for (const event of events) {
      const payload = event.payload
      if (
        !payload ||
        typeof payload !== "object" ||
        !("hash" in payload) ||
        typeof payload.hash !== "string"
      ) {
        continue
      }

      if (!hashes.includes(payload.hash.toLowerCase())) {
        continue
      }

      const chainId =
        "chainId" in payload && typeof payload.chainId === "number" ? payload.chainId : null
      if (chainId === null) {
        continue
      }

      try {
        if (await enrichTraceEvent(event)) {
          updatedCount += 1
        }
      } catch (error) {
        console.warn(`[enrichment-worker] failed to enrich ${payload.hash}`, error)
        await scheduleRetry(
          {
            eventId: event.id,
            traceId: event.traceId,
            txHash: payload.hash,
            chainId,
          },
          error instanceof Error ? error.message : "unknown_error"
        )
      }
    }

    return reply.status(202).send({
      updated: updatedCount,
    })
  })

  app.get("/healthz", async () => {
    return {
      ok: true,
      service: "enrichment-worker",
    }
  })

  app.get("/metrics", async () => {
    const redis = getRedis()
    return {
      service: "enrichment-worker",
      retryQueueDepth: await redis.llen(ENRICHMENT_RETRY_QUEUE),
      dlqDepth: await redis.llen(ENRICHMENT_DLQ_QUEUE),
      processedTotal: Number((await redis.get<string>(getMetricKey("processed_total"))) ?? "0"),
      retryTotal: Number((await redis.get<string>(getMetricKey("retry_total"))) ?? "0"),
      dlqTotal: Number((await redis.get<string>(getMetricKey("dlq_total"))) ?? "0"),
    }
  })

  return app
}

const traceIdParamSchema = z.object({
  id: z.string(),
})

void traceIdParamSchema
