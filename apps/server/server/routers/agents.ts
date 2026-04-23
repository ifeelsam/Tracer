/**
 * The agents router owns authenticated CRUD and connection status for traced agents.
 * It also keeps Alchemy wallet tracking in sync when agent wallets are added or removed.
 */
import { createHash, randomBytes } from "node:crypto"
import { prisma } from "@tracerlabs/db"
import { ulid } from "ulid"
import { z } from "zod"

import { addWalletToAlchemyWebhook, removeWalletFromAlchemyWebhook } from "../../lib/alchemy"
import { protectedProcedure, router } from "../trpc"

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex")
}

function generateSecret(bytes = 24): string {
  return randomBytes(bytes).toString("base64url")
}

async function ensureUser(userId: string) {
  await prisma.user.upsert({
    where: {
      id: userId,
    },
    create: {
      id: userId,
    },
    update: {},
  })
}

export const agentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureUser(ctx.userId)
    return prisma.agent.findMany({
      where: {
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
      orderBy: {
        createdAt: "desc",
      },
    })
  }),
  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    return prisma.agent.findFirst({
      where: {
        id: input,
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
    })
  }),
  create: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1),
        chainId: z.number().int(),
        environment: z.enum(["testnet", "mainnet"]),
        agentWallet: z.string().optional(),
        privateMode: z.boolean().optional(),
        retentionDays: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureUser(ctx.userId)

      const agentId = ulid()
      const apiKey = generateSecret(32)
      const verifyToken = generateSecret(18)
      const agent = await prisma.agent.create({
        data: {
          id: agentId,
          ownerId: ctx.userId,
          displayName: input.displayName,
          apiKeyHash: hashApiKey(apiKey),
          chainId: input.chainId,
          environment: input.environment,
          agentWallet: input.agentWallet ?? null,
          privateMode: input.privateMode ?? false,
          retentionDays: input.retentionDays ?? 30,
          verifyToken,
        },
      })

      if (agent.agentWallet) {
        await addWalletToAlchemyWebhook(agent.agentWallet, agent.chainId)
      }

      return {
        agent,
        apiKey,
        verifyToken,
      }
    }),
  rotateKey: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const apiKey = generateSecret(32)
    await prisma.agent.updateMany({
      where: {
        id: input,
        ownerId: ctx.userId,
      },
      data: {
        apiKeyHash: hashApiKey(apiKey),
      },
    })

    return {
      apiKey,
    }
  }),
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input,
        ownerId: ctx.userId,
      },
      select: {
        id: true,
        chainId: true,
        agentWallet: true,
        traces: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!agent) {
      return {
        deleted: false,
      }
    }

    if (agent.agentWallet) {
      await removeWalletFromAlchemyWebhook(agent.agentWallet, agent.chainId)
    }

    const traceIds = agent.traces.map((trace) => trace.id)
    await prisma.$transaction(async (tx) => {
      if (traceIds.length > 0) {
        await tx.traceAnalysis.deleteMany({
          where: {
            traceId: {
              in: traceIds,
            },
          },
        })
        await tx.traceEvent.deleteMany({
          where: {
            traceId: {
              in: traceIds,
            },
          },
        })
        await tx.trace.deleteMany({
          where: {
            id: {
              in: traceIds,
            },
          },
        })
      }

      await tx.agentOwner.deleteMany({
        where: {
          agentId: agent.id,
        },
      })
      await tx.agent.delete({
        where: {
          id: agent.id,
        },
      })
    })

    return {
      deleted: true,
    }
  }),
  checkConnection: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input,
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
      select: {
        verified: true,
        traces: {
          take: 1,
          orderBy: {
            startedAt: "asc",
          },
          select: {
            id: true,
            startedAt: true,
          },
        },
      },
    })

    const firstTrace = agent?.traces[0] ?? null
    return {
      connected: firstTrace !== null,
      verified: agent?.verified ?? false,
      firstTraceId: firstTrace?.id ?? null,
      firstSeenAt: firstTrace?.startedAt ?? null,
    }
  }),
})
