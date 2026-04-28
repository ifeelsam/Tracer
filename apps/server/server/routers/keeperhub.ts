/**
 * The KeeperHub router exposes authenticated endpoints for triggering KeeperHub execution
 * and retrieving status so the dashboard and demos can show reliable execution lifecycles.
 */
import { prisma } from "@tracerlabs/db"
import { ulid } from "ulid"
import { z } from "zod"

import {
  type KeeperHubDirectContractCallRequest,
  keeperHubDirectContractCall,
  keeperHubGetDirectExecutionStatus,
  keeperHubTriggerWorkflowWebhook,
} from "../../lib/keeperhub"
import { protectedProcedure, router } from "../trpc"

const networkSchema = z.string().min(1)

const keeperHubContractCallInputSchema = z.object({
  network: networkSchema,
  contractAddress: z.string().min(1),
  functionName: z.string().min(1),
  functionArgs: z.array(z.unknown()).optional(),
  abi: z.array(z.unknown()).optional(),
  valueWei: z.string().optional(),
  gasLimitMultiplier: z.string().optional(),
})

const keeperHubWorkflowWebhookInputSchema = z.object({
  workflowId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
})

function readExecutionId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null
  }
  const record = payload as Record<string, unknown>
  if (typeof record.executionId === "string") {
    return record.executionId
  }
  if (typeof record.result === "object" && record.result !== null) {
    const result = record.result as Record<string, unknown>
    if (typeof result.executionId === "string") {
      return result.executionId
    }
  }
  return null
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
    select: {
      id: true,
    },
  })
}

async function getNextSequence(traceId: string): Promise<number> {
  const latestEvent = await prisma.traceEvent.findFirst({
    where: {
      traceId,
    },
    orderBy: {
      sequence: "desc",
    },
    select: {
      sequence: true,
    },
  })
  return (latestEvent?.sequence ?? -1) + 1
}

async function appendKeeperHubEvent(args: {
  traceId: string
  name: string
  payload: Record<string, unknown>
  status: "ok" | "error"
  errorMessage?: string
  startedAt?: Date
}) {
  const startedAt = args.startedAt ?? new Date()
  const endedAt = new Date()
  const sequence = await getNextSequence(args.traceId)
  return prisma.traceEvent.create({
    data: {
      id: ulid(),
      traceId: args.traceId,
      parentEventId: null,
      sequence,
      type: "tool_call",
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      payload: {
        name: args.name,
        ...args.payload,
      },
      payloadEncrypted: false,
      status: args.status,
      errorMessage: args.errorMessage ?? null,
    },
    select: {
      id: true,
      sequence: true,
    },
  })
}

function normalizeKeeperHubRequest(input: z.infer<typeof keeperHubContractCallInputSchema>) {
  const body: KeeperHubDirectContractCallRequest = {
    network: input.network,
    contractAddress: input.contractAddress,
    functionName: input.functionName,
  }

  if (input.functionArgs) {
    body.functionArgs = JSON.stringify(input.functionArgs)
  }
  if (input.abi) {
    body.abi = JSON.stringify(input.abi)
  }
  if (input.valueWei) {
    body.value = input.valueWei
  }
  if (input.gasLimitMultiplier) {
    body.gasLimitMultiplier = input.gasLimitMultiplier
  }
  return body
}

function readKeeperHubStatus(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null
  }
  const record = payload as Record<string, unknown>
  if (typeof record.status === "string") {
    return record.status
  }
  return null
}

export const keeperHubRouter = router({
  directContractCall: protectedProcedure
    .input(keeperHubContractCallInputSchema)
    .mutation(async ({ input }) => {
      const body = normalizeKeeperHubRequest(input)
      return keeperHubDirectContractCall(body)
    }),
  runForTrace: protectedProcedure
    .input(
      z.object({
        traceId: z.string().min(1),
        request: keeperHubContractCallInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trace = await assertTraceAccess(ctx.userId, input.traceId)
      if (!trace) {
        return {
          queued: false,
        }
      }

      const startedAt = new Date()
      try {
        const response = await keeperHubDirectContractCall(normalizeKeeperHubRequest(input.request))
        const executionId = readExecutionId(response)
        const status = readKeeperHubStatus(response)
        await appendKeeperHubEvent({
          traceId: input.traceId,
          name: "keeperhub.directContractCall",
          payload: {
            request: input.request,
            executionId,
            status,
            result: response,
          },
          status: "ok",
          startedAt,
        })
        return {
          queued: true,
          executionId,
          status: status ?? "unknown",
        }
      } catch (error) {
        await appendKeeperHubEvent({
          traceId: input.traceId,
          name: "keeperhub.directContractCall",
          payload: {
            request: input.request,
          },
          status: "error",
          errorMessage: error instanceof Error ? error.message : "KeeperHub request failed.",
          startedAt,
        })
        throw error
      }
    }),
  runWorkflowForTrace: protectedProcedure
    .input(
      z.object({
        traceId: z.string().min(1),
        request: keeperHubWorkflowWebhookInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trace = await assertTraceAccess(ctx.userId, input.traceId)
      if (!trace) {
        return {
          queued: false,
        }
      }

      const startedAt = new Date()
      try {
        const response = await keeperHubTriggerWorkflowWebhook({
          workflowId: input.request.workflowId,
          payload: input.request.payload,
        })
        const executionId = readExecutionId(response)
        const status = readKeeperHubStatus(response) ?? "triggered"

        await appendKeeperHubEvent({
          traceId: input.traceId,
          name: "keeperhub.workflowWebhook.triggered",
          payload: {
            request: input.request,
            executionId,
            status,
            result: response,
          },
          status: "ok",
          startedAt,
        })

        await appendKeeperHubEvent({
          traceId: input.traceId,
          name: "keeperhub.workflowWebhook.status",
          payload: {
            workflowId: input.request.workflowId,
            executionId,
            status,
            source: "trigger_response",
          },
          status: status === "failed" ? "error" : "ok",
          ...(status === "failed"
            ? { errorMessage: "Workflow execution was marked failed at trigger response." }
            : {}),
          startedAt,
        })

        return {
          queued: true,
          executionId,
          status,
        }
      } catch (error) {
        await appendKeeperHubEvent({
          traceId: input.traceId,
          name: "keeperhub.workflowWebhook.triggered",
          payload: {
            request: input.request,
          },
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "KeeperHub workflow webhook request failed.",
          startedAt,
        })
        throw error
      }
    }),

  directExecutionStatus: protectedProcedure
    .input(z.object({ executionId: z.string().min(1) }))
    .query(async ({ input }) => {
      return keeperHubGetDirectExecutionStatus(input.executionId)
    }),
  refreshExecutionForTrace: protectedProcedure
    .input(
      z.object({
        traceId: z.string().min(1),
        executionId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trace = await assertTraceAccess(ctx.userId, input.traceId)
      if (!trace) {
        return {
          refreshed: false,
        }
      }

      const startedAt = new Date()
      const status = await keeperHubGetDirectExecutionStatus(input.executionId)
      const statusValue = status.status
      const failedMessage =
        statusValue === "failed" ? JSON.stringify(status.error ?? "Execution failed") : null
      await appendKeeperHubEvent({
        traceId: input.traceId,
        name: "keeperhub.directExecutionStatus",
        payload: {
          executionId: input.executionId,
          status: statusValue,
          execution: status,
        },
        status: statusValue === "failed" ? "error" : "ok",
        ...(failedMessage ? { errorMessage: failedMessage } : {}),
        startedAt,
      })

      return {
        refreshed: true,
        status: statusValue,
      }
    }),
  executionsForTrace: protectedProcedure
    .input(z.object({ traceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const events = await prisma.traceEvent.findMany({
        where: {
          traceId: input.traceId,
          type: "tool_call",
          trace: {
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
          },
        },
        select: {
          payload: true,
        },
      })
      const executionIds = [
        ...new Set(
          events
            .map((event) => readExecutionId(event.payload))
            .filter((executionId): executionId is string => Boolean(executionId))
        ),
      ]
      return {
        executionIds,
      }
    }),
  reliabilityMetrics: protectedProcedure.query(async ({ ctx }) => {
    const events = await prisma.traceEvent.findMany({
      where: {
        type: "tool_call",
        trace: {
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
        },
      },
      select: {
        startedAt: true,
        payload: true,
      },
      orderBy: {
        startedAt: "asc",
      },
      take: 1500,
    })

    const executions = new Map<
      string,
      {
        firstAt: number
        latestStatus: string
        terminalAt: number | null
        statusChecks: number
        failedReason: string | null
      }
    >()

    for (const event of events) {
      if (typeof event.payload !== "object" || event.payload === null) {
        continue
      }
      const payload = event.payload as Record<string, unknown>
      const name = typeof payload.name === "string" ? payload.name : null
      if (!name || !name.toLowerCase().includes("keeperhub")) {
        continue
      }
      const executionId = readExecutionId(payload)
      if (!executionId) {
        continue
      }
      const eventAt = event.startedAt.getTime()
      const next = executions.get(executionId) ?? {
        firstAt: eventAt,
        latestStatus: "unknown",
        terminalAt: null,
        statusChecks: 0,
        failedReason: null,
      }
      next.firstAt = Math.min(next.firstAt, eventAt)
      const status = readKeeperHubStatus(payload) ?? next.latestStatus
      next.latestStatus = status

      if (name === "keeperhub.directExecutionStatus") {
        next.statusChecks += 1
      }
      if (status === "completed" || status === "failed") {
        next.terminalAt = eventAt
      }
      if (status === "failed" && payload.execution && typeof payload.execution === "object") {
        const execution = payload.execution as Record<string, unknown>
        const reason = execution.error
        if (typeof reason === "string") {
          next.failedReason = reason
        } else if (reason && typeof reason === "object") {
          next.failedReason = JSON.stringify(reason)
        }
      }
      executions.set(executionId, next)
    }

    const records = [...executions.values()]
    const terminal = records.filter(
      (record) => record.latestStatus === "completed" || record.latestStatus === "failed"
    )
    const completed = terminal.filter((record) => record.latestStatus === "completed").length
    const failed = terminal.filter((record) => record.latestStatus === "failed").length
    const retries = records.reduce((sum, record) => sum + Math.max(0, record.statusChecks - 1), 0)
    const ttfSamples = records
      .filter((record) => record.terminalAt !== null)
      .map((record) => (record.terminalAt ?? record.firstAt) - record.firstAt)
      .filter((value) => value >= 0)
    const averageTimeToFinalityMs =
      ttfSamples.length > 0
        ? Math.round(ttfSamples.reduce((sum, value) => sum + value, 0) / ttfSamples.length)
        : null

    const failedReasonCounts = new Map<string, number>()
    for (const record of records) {
      if (record.latestStatus !== "failed" || !record.failedReason) {
        continue
      }
      failedReasonCounts.set(
        record.failedReason,
        (failedReasonCounts.get(record.failedReason) ?? 0) + 1
      )
    }
    const topFailedReason =
      [...failedReasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const successRateRatio = terminal.length > 0 ? completed / terminal.length : null
    const retryEfficiency =
      records.length > 0
        ? Math.max(0, Math.min(1, 1 - retries / Math.max(1, records.length)))
        : null
    const finalityEfficiency =
      averageTimeToFinalityMs !== null
        ? Math.max(0, Math.min(1, 1 - averageTimeToFinalityMs / 120_000))
        : null

    const reliabilityScore =
      successRateRatio === null || retryEfficiency === null || finalityEfficiency === null
        ? null
        : Math.round(successRateRatio * 60 + retryEfficiency * 20 + finalityEfficiency * 20)

    const terminalTimeline = records
      .filter(
        (record) =>
          (record.latestStatus === "completed" || record.latestStatus === "failed") &&
          record.terminalAt !== null
      )
      .sort((a, b) => (a.terminalAt ?? 0) - (b.terminalAt ?? 0))

    const scoreTrend = (() => {
      if (terminalTimeline.length < 4) {
        return "insufficient_data" as const
      }
      const windowSize = Math.min(5, Math.floor(terminalTimeline.length / 2))
      const recent = terminalTimeline.slice(-windowSize)
      const previous = terminalTimeline.slice(-(windowSize * 2), -windowSize)
      if (recent.length === 0 || previous.length === 0) {
        return "insufficient_data" as const
      }
      const recentRate =
        recent.filter((record) => record.latestStatus === "completed").length / recent.length
      const previousRate =
        previous.filter((record) => record.latestStatus === "completed").length / previous.length
      const delta = recentRate - previousRate
      if (delta > 0.15) {
        return "improving" as const
      }
      if (delta < -0.15) {
        return "degrading" as const
      }
      return "stable" as const
    })()

    return {
      totalExecutions: records.length,
      completedExecutions: completed,
      failedExecutions: failed,
      successRatePct: terminal.length > 0 ? Math.round((completed / terminal.length) * 100) : null,
      retries,
      averageTimeToFinalityMs,
      topFailedReason,
      reliabilityScore,
      scoreTrend,
      scoreComponents: {
        successRate: successRateRatio !== null ? Number((successRateRatio * 100).toFixed(1)) : null,
        retryEfficiency:
          retryEfficiency !== null ? Number((retryEfficiency * 100).toFixed(1)) : null,
        finalityEfficiency:
          finalityEfficiency !== null ? Number((finalityEfficiency * 100).toFixed(1)) : null,
      },
    }
  }),
})
