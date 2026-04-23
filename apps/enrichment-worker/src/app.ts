/**
 * The enrichment app consumes Alchemy webhooks and fills in EVM transaction details after confirmation.
 * It updates stored event payloads in place and emits a ready signal once enrichment completes.
 */
import { type Prisma, prisma } from "@tracerlabs/db"
import Fastify from "fastify"
import { z } from "zod"

import { extractWebhookHashes, isAuthorizedWebhook } from "./lib/alchemy"
import { getPublicClient } from "./lib/chains"
import { decodeKnownLogs } from "./lib/decode"
import { getRedis } from "./lib/redis"
import { alchemyWebhookSchema } from "./schemas"

interface ReceiptLogLike {
  address: string
  topics: readonly `0x${string}`[]
  data: `0x${string}`
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
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
  const app = Fastify({
    logger: false,
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
    const redis = getRedis()

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

        await redis.publish(
          `enrichment:ready:${event.traceId}`,
          JSON.stringify({ traceId: event.traceId })
        )
        updatedCount += 1
      } catch (error) {
        console.warn(`[enrichment-worker] failed to enrich ${payload.hash}`, error)
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

  return app
}

const traceIdParamSchema = z.object({
  id: z.string(),
})

void traceIdParamSchema
