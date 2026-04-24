/**
 * The traces router exposes authenticated trace listing, detail, sharing, and deletion flows.
 * Query behavior is optimized for dashboard consumption rather than arbitrary ad hoc analytics.
 */
import { randomBytes } from "node:crypto"
import { type Prisma, prisma } from "@tracerlabs/db"
import { z } from "zod"

import { protectedProcedure, router } from "../trpc"

function shareBaseUrl(): string {
  return process.env.TRACER_APP_URL ?? "http://localhost:3000"
}

function generateShareToken(): string {
  return randomBytes(18).toString("base64url")
}

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
  })
}

export const tracesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        cursor: z.string().nullish(),
        filters: z
          .object({
            chainId: z.number().int().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const cursorTrace = input.cursor
        ? await prisma.trace.findUnique({
            where: {
              id: input.cursor,
            },
            select: {
              id: true,
              startedAt: true,
            },
          })
        : null

      const traces = await prisma.trace.findMany({
        where: {
          agentId: input.agentId,
          ...(input.filters?.chainId !== undefined ? { chainId: input.filters.chainId } : {}),
          agent: {
            OR: [
              { ownerId: ctx.userId },
              {
                agentOwners: {
                  some: {
                    userId: ctx.userId,
                  },
                },
              },
            ],
          },
          ...(cursorTrace
            ? {
                OR: [
                  {
                    startedAt: {
                      lt: cursorTrace.startedAt,
                    },
                  },
                  {
                    startedAt: cursorTrace.startedAt,
                    id: {
                      lt: cursorTrace.id,
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        take: 20,
      })

      return {
        items: traces,
        nextCursor: traces.length === 20 ? (traces.at(-1)?.id ?? null) : null,
      }
    }),
  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const trace = await assertTraceAccess(ctx.userId, input)
    if (!trace) {
      return null
    }

    const [events, analysis] = await Promise.all([
      prisma.traceEvent.findMany({
        where: {
          traceId: trace.id,
        },
        orderBy: {
          sequence: "asc",
        },
      }),
      prisma.traceAnalysis.findUnique({
        where: {
          traceId: trace.id,
        },
      }),
    ])

    return {
      trace,
      events,
      analysis,
    }
  }),
  share: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const trace = await assertTraceAccess(ctx.userId, input)
    if (!trace) {
      return null
    }

    const shareToken = trace.shareToken ?? generateShareToken()
    await prisma.trace.update({
      where: {
        id: trace.id,
      },
      data: {
        shareToken,
      },
    })

    return {
      shareUrl: `${shareBaseUrl()}/share/${shareToken}`,
      shareToken,
    }
  }),
  unshare: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const trace = await assertTraceAccess(ctx.userId, input)
    if (!trace) {
      return {
        success: false,
      }
    }

    await prisma.trace.update({
      where: {
        id: trace.id,
      },
      data: {
        shareToken: null,
      },
    })

    return {
      success: true,
    }
  }),
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const trace = await assertTraceAccess(ctx.userId, input)
    if (!trace) {
      return {
        deleted: false,
      }
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.traceAnalysis.deleteMany({
        where: {
          traceId: trace.id,
        },
      })
      await tx.traceEvent.deleteMany({
        where: {
          traceId: trace.id,
        },
      })
      await tx.trace.delete({
        where: {
          id: trace.id,
        },
      })
    })

    return {
      deleted: true,
    }
  }),
})
