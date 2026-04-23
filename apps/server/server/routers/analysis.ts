/**
 * The analysis router exposes stored trace analyses and a rerun trigger for queued recomputation.
 * Reruns are lightweight queue writes so the dashboard can request fresh analysis without blocking.
 */
import { prisma } from "@tracerlabs/db"
import { z } from "zod"

import { getRedis } from "../../lib/redis"
import { protectedProcedure, router } from "../trpc"

async function assertTraceAccess(userId: string, traceId: string) {
  return prisma.trace.findFirst({
    where: {
      id: traceId,
      agent: {
        OR: [
          { ownerId: userId },
          {
            agentOwners: {
              some: {
                userId,
              },
            },
          },
        ],
      },
    },
    select: {
      id: true,
    },
  })
}

export const analysisRouter = router({
  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const trace = await assertTraceAccess(ctx.userId, input)
    if (!trace) {
      return null
    }

    return prisma.traceAnalysis.findUnique({
      where: {
        traceId: trace.id,
      },
    })
  }),
  rerun: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const trace = await assertTraceAccess(ctx.userId, input)
    if (!trace) {
      return {
        queued: false,
      }
    }

    await getRedis().lpush("analysis:pending", trace.id)
    return {
      queued: true,
    }
  }),
})
