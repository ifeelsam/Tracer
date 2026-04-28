/**
 * The agents router owns authenticated CRUD and connection status for traced agents.
 * It also keeps Alchemy wallet tracking in sync when agent wallets are added or removed.
 */
import { createHash, randomBytes } from "node:crypto"
import { type Prisma, prisma } from "@tracerlabs/db"
import { TRPCError } from "@trpc/server"
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

const agentReadSelect = {
  id: true,
  ownerId: true,
  displayName: true,
  chainId: true,
  environment: true,
  verified: true,
  agentWallet: true,
  privateMode: true,
  retentionDays: true,
  createdAt: true,
  verifiedAt: true,
} satisfies Prisma.AgentSelect

function getAccessWhere(userId: string): Prisma.AgentWhereInput {
  return {
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
  }
}

export const agentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureUser(ctx.userId)
    const agents = await prisma.agent.findMany({
      where: {
        ...getAccessWhere(ctx.userId),
      },
      select: agentReadSelect,
      orderBy: {
        createdAt: "desc",
      },
    })
    return agents.map((agent) => ({
      ...agent,
      actorRole: agent.ownerId === ctx.userId ? "owner" : "collaborator",
    }))
  }),
  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input,
        ...getAccessWhere(ctx.userId),
      },
      select: agentReadSelect,
    })
    if (!agent) {
      return null
    }
    return {
      ...agent,
      actorRole: agent.ownerId === ctx.userId ? "owner" : "collaborator",
      canRotateApiKey: agent.ownerId === ctx.userId,
      canDelete: agent.ownerId === ctx.userId,
    }
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
        agent: {
          ...agent,
          actorRole: "owner" as const,
        },
        apiKey,
        verifyToken,
      }
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        displayName: z.string().min(1).max(120).optional(),
        chainId: z.number().int().optional(),
        environment: z.enum(["testnet", "mainnet"]).optional(),
        agentWallet: z.string().nullable().optional(),
        privateMode: z.boolean().optional(),
        retentionDays: z.number().int().min(1).max(365).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.agent.findFirst({
        where: {
          id: input.id,
          ...getAccessWhere(ctx.userId),
        },
        select: {
          id: true,
          ownerId: true,
          chainId: true,
          agentWallet: true,
          agentOwners: {
            where: {
              userId: ctx.userId,
            },
            select: {
              role: true,
            },
            take: 1,
          },
        },
      })
      if (!existing) {
        return null
      }

      const actorRole = existing.ownerId === ctx.userId ? "owner" : existing.agentOwners[0]?.role
      if (!actorRole) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      const restrictedToOwner =
        input.chainId !== undefined ||
        input.environment !== undefined ||
        input.agentWallet !== undefined
      if (actorRole !== "owner" && restrictedToOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners can update wallet, chain, and environment settings.",
        })
      }

      const updated = await prisma.agent.update({
        where: {
          id: existing.id,
        },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.chainId !== undefined ? { chainId: input.chainId } : {}),
          ...(input.environment !== undefined ? { environment: input.environment } : {}),
          ...(input.privateMode !== undefined ? { privateMode: input.privateMode } : {}),
          ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {}),
          ...(input.agentWallet !== undefined ? { agentWallet: input.agentWallet } : {}),
        },
        select: agentReadSelect,
      })

      if (actorRole === "owner" && input.agentWallet !== undefined) {
        if (existing.agentWallet && existing.agentWallet !== input.agentWallet) {
          await removeWalletFromAlchemyWebhook(existing.agentWallet, existing.chainId)
        }
        if (input.agentWallet && input.agentWallet !== existing.agentWallet) {
          const nextChainId = input.chainId ?? existing.chainId
          await addWalletToAlchemyWebhook(input.agentWallet, nextChainId)
        }
      }

      return {
        ...updated,
        actorRole: updated.ownerId === ctx.userId ? "owner" : "collaborator",
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

    const traceIds = agent.traces.map((trace: { id: string }) => trace.id)
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
