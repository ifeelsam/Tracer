import { gunzipSync } from "node:zlib"
import { type Prisma, prisma } from "@tracerlabs/db"
import { sha256Hex } from "@tracerlabs/shared"
import Fastify from "fastify"
import { z } from "zod"

/**
 * The Fastify app owns request validation and the trace ingestion lifecycle for live Tracer data.
 * Routes are registered here so tests and workers can reuse the same configured server instance.
 */
import { authenticatePrivyToken } from "./lib/privy"
import { getRedis } from "./lib/redis"
import { traceBatchRequestSchema, traceCompleteRequestSchema } from "./schemas"

const traceIdParamSchema = z.object({
  id: z.string(),
})
const agentIdParamSchema = z.object({
  id: z.string(),
})

function getRateLimitWindow(): string {
  return new Date().toISOString().slice(0, 16)
}

interface ResolvedAgent {
  id: string
  verifyToken: string
  verified: boolean
}

async function resolveAgent(apiKey: string): Promise<ResolvedAgent | null> {
  const redis = getRedis()
  const apiKeyHash = sha256Hex(apiKey)
  const cacheKey = `apikey:${apiKeyHash}`
  const cachedAgentId = await redis.get<string>(cacheKey)
  if (cachedAgentId) {
    const cachedAgent = await prisma.agent.findUnique({
      where: {
        id: cachedAgentId,
      },
      select: {
        id: true,
        verifyToken: true,
        verified: true,
      },
    })

    if (cachedAgent) {
      return cachedAgent
    }
  }

  const agent = await prisma.agent.findUnique({
    where: {
      apiKeyHash,
    },
    select: {
      id: true,
      verifyToken: true,
      verified: true,
    },
  })

  if (!agent) {
    return null
  }

  await redis.set(cacheKey, agent.id, {
    ex: 60 * 15,
  })

  return agent
}

async function rateLimitAgent(agentId: string): Promise<boolean> {
  const redis = getRedis()
  const limit = Number.parseInt(process.env.INGEST_RATELIMIT_PER_MIN ?? "10000", 10)
  const key = `ratelimit:${agentId}:${getRateLimitWindow()}`
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, 120)
  }

  return count <= limit
}

type TraceEventPayloadInput = Prisma.TraceEventCreateManyInput["payload"]

function toInputJsonValue(value: unknown): TraceEventPayloadInput {
  return JSON.parse(JSON.stringify(value)) as TraceEventPayloadInput
}

export function buildApp() {
  const app = Fastify({
    logger: false,
    bodyLimit: Number.parseInt(process.env.INGEST_MAX_BODY_BYTES ?? "10485760", 10),
  })

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    try {
      const encodingHeader = request.headers["content-encoding"]
      const encoding = Array.isArray(encodingHeader) ? encodingHeader[0] : encodingHeader
      const raw =
        typeof encoding === "string" && encoding.toLowerCase().includes("gzip")
          ? gunzipSync(body)
          : body
      const text = raw.toString("utf8")
      done(null, JSON.parse(text) as unknown)
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  app.post("/v1/traces/batch", async (request, reply) => {
    const parsedBody = traceBatchRequestSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_request",
        issues: parsedBody.error.flatten(),
      })
    }

    const apiKey = request.headers["x-tracer-api-key"]
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return reply.status(401).send({
        error: "missing_api_key",
      })
    }

    const agent = await resolveAgent(apiKey)
    if (!agent) {
      return reply.status(401).send({
        error: "invalid_api_key",
      })
    }

    const allowed = await rateLimitAgent(agent.id)
    if (!allowed) {
      return reply.status(429).send({
        error: "rate_limited",
      })
    }

    const redis = getRedis()
    const body = parsedBody.data
    const firstTraceId = body.traces[0]?.trace.id ?? null

    const wasFirstTrace = (await prisma.trace.count({ where: { agentId: agent.id } })) === 0
    const matchedVerifyToken = body.traces.some((trace) => trace.verifyToken === agent.verifyToken)

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const bufferedTrace of body.traces) {
        const trace = bufferedTrace.trace
        await tx.trace.upsert({
          where: {
            id: trace.id,
          },
          create: {
            id: trace.id,
            agentId: agent.id,
            chainId: trace.chainId,
            status: trace.status,
            startedAt: trace.startedAt,
            endedAt: trace.endedAt,
            durationMs: trace.durationMs,
            inputSummary: trace.inputSummary,
            outputSummary: trace.outputSummary,
            errorMessage: trace.errorMessage,
            eventCount: trace.eventCount,
            totalTokens: trace.totalTokens,
            totalCostUsd: trace.totalCostUsd,
            totalGasUsed: trace.totalGasUsed,
            evmTxCount: trace.evmTxCount,
            toolsCalled: trace.toolsCalled,
            anchorTxHash: trace.anchorTxHash,
            anchorBlock: trace.anchorBlock,
            merkleProof: trace.merkleProof,
            traceHash: trace.traceHash,
            shareToken: trace.shareToken,
            tags: trace.tags,
          },
          update: {
            chainId: trace.chainId,
            status: trace.status,
            endedAt: trace.endedAt,
            durationMs: trace.durationMs,
            outputSummary: trace.outputSummary,
            errorMessage: trace.errorMessage,
            eventCount: trace.eventCount,
            totalTokens: trace.totalTokens,
            totalCostUsd: trace.totalCostUsd,
            totalGasUsed: trace.totalGasUsed,
            evmTxCount: trace.evmTxCount,
            toolsCalled: trace.toolsCalled,
            anchorTxHash: trace.anchorTxHash,
            anchorBlock: trace.anchorBlock,
            merkleProof: trace.merkleProof,
            traceHash: trace.traceHash,
            shareToken: trace.shareToken,
            tags: trace.tags,
          },
        })

        if (bufferedTrace.events.length > 0) {
          await tx.traceEvent.createMany({
            data: bufferedTrace.events.map((event) => ({
              id: event.id,
              traceId: trace.id,
              parentEventId: event.parentEventId,
              sequence: event.sequence,
              type: event.type,
              startedAt: event.startedAt,
              endedAt: event.endedAt,
              durationMs: event.durationMs,
              payload: toInputJsonValue(event.payload),
              payloadEncrypted: event.payloadEncrypted,
              status: event.status,
              errorMessage: event.errorMessage,
            })),
            skipDuplicates: true,
          })
        }
      }

      if (wasFirstTrace && matchedVerifyToken && !agent.verified) {
        await tx.agent.update({
          where: {
            id: agent.id,
          },
          data: {
            verified: true,
            verifiedAt: new Date(),
          },
        })
      }
    })

    for (const bufferedTrace of body.traces) {
      await redis.lpush(`live:${agent.id}`, JSON.stringify(bufferedTrace))
      await redis.ltrim(`live:${agent.id}`, 0, 999)
      await redis.publish(`pubsub:live:${agent.id}`, JSON.stringify(bufferedTrace))

      if (
        bufferedTrace.trace.status === "completed" ||
        bufferedTrace.trace.status === "errored" ||
        bufferedTrace.trace.status === "timeout"
      ) {
        await redis.lpush("anchor:pending", bufferedTrace.trace.id)
        await redis.lpush("analysis:pending", bufferedTrace.trace.id)
      }
    }

    if (wasFirstTrace) {
      await redis.publish(
        "agent:connected",
        JSON.stringify({
          agentId: agent.id,
          verified: wasFirstTrace && matchedVerifyToken ? true : agent.verified,
          traceId: firstTraceId,
          connectedAt: Date.now(),
        })
      )
    }

    return reply.status(202).send({
      traceId: firstTraceId,
    })
  })

  app.post("/v1/traces/:id/complete", async (request, reply) => {
    const params = traceIdParamSchema.safeParse(request.params)
    const parsedBody = traceCompleteRequestSchema.safeParse(request.body)
    if (!params.success || !parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_request",
      })
    }

    const apiKey = request.headers["x-tracer-api-key"]
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return reply.status(401).send({
        error: "missing_api_key",
      })
    }

    const agent = await resolveAgent(apiKey)
    if (!agent) {
      return reply.status(401).send({
        error: "invalid_api_key",
      })
    }

    const trace = await prisma.trace.update({
      where: {
        id: params.data.id,
        agentId: agent.id,
      },
      data: {
        status: parsedBody.data.status,
        endedAt: parsedBody.data.endedAt,
        ...(parsedBody.data.durationMs !== undefined
          ? {
              durationMs: parsedBody.data.durationMs,
            }
          : {}),
        ...(parsedBody.data.outputSummary !== undefined
          ? {
              outputSummary: parsedBody.data.outputSummary,
            }
          : {}),
        ...(parsedBody.data.errorMessage !== undefined
          ? {
              errorMessage: parsedBody.data.errorMessage,
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
      },
    })

    const redis = getRedis()
    if (trace.status === "completed" || trace.status === "errored" || trace.status === "timeout") {
      await redis.lpush("anchor:pending", trace.id)
      await redis.lpush("analysis:pending", trace.id)
    }

    return reply.status(202).send({
      traceId: trace.id,
    })
  })

  app.get("/v1/agents/:id/live", async (request, reply) => {
    const params = agentIdParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.status(400).send({
        error: "invalid_request",
      })
    }

    const userId = await authenticatePrivyToken(request.headers.authorization)
    if (!userId) {
      return reply.status(401).send({
        error: "unauthorized",
      })
    }

    const agent = await prisma.agent.findFirst({
      where: {
        id: params.data.id,
        OR: [
          {
            ownerId: userId,
          },
          {
            agentOwners: {
              some: {
                userId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    })

    if (!agent) {
      return reply.status(403).send({
        error: "forbidden",
      })
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    })

    const redis = getRedis()
    const seenPayloads = new Set<string>()
    const seenOrder: string[] = []

    const rememberPayload = (payload: string) => {
      if (seenPayloads.has(payload)) {
        return false
      }

      seenPayloads.add(payload)
      seenOrder.push(payload)
      if (seenOrder.length > 200) {
        const oldest = seenOrder.shift()
        if (oldest) {
          seenPayloads.delete(oldest)
        }
      }

      return true
    }

    const sendEvent = (payload: string) => {
      reply.raw.write(`data: ${payload}\n\n`)
    }

    const pumpLiveEvents = async () => {
      try {
        const items = await redis.lrange<string>(`live:${agent.id}`, 0, 49)
        const orderedItems = [...items].reverse()
        for (const item of orderedItems) {
          if (typeof item !== "string") {
            continue
          }

          if (rememberPayload(item)) {
            sendEvent(item)
          }
        }
      } catch {
        reply.raw.write("event: error\ndata: live_stream_failed\n\n")
      }
    }

    await pumpLiveEvents()
    const poller = setInterval(() => {
      void pumpLiveEvents()
    }, 2_000)
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n")
    }, 15_000)

    await new Promise<void>((resolve) => {
      request.raw.on("close", () => {
        clearInterval(poller)
        clearInterval(heartbeat)
        resolve()
      })
    })
  })

  app.get("/healthz", async () => {
    return {
      ok: true,
      service: "ingest",
    }
  })

  return app
}
