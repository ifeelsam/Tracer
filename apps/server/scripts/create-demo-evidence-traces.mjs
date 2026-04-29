import { randomBytes } from "node:crypto"

import { prisma } from "../../../packages/db/src/client.ts"

const sourceTraceId = process.env.SOURCE_TRACE_ID ?? "manual_1777365736227"

function mkToken() {
  return randomBytes(18).toString("base64url")
}

function mkTraceId(suffix) {
  return `${sourceTraceId}_${suffix}_${Date.now().toString().slice(-6)}`
}

const sourceTrace = await prisma.trace.findUnique({
  where: { id: sourceTraceId },
})

if (!sourceTrace) {
  throw new Error(`Source trace '${sourceTraceId}' not found.`)
}

const sourceEvents = await prisma.traceEvent.findMany({
  where: { traceId: sourceTraceId },
  orderBy: { sequence: "asc" },
})

const keeperHubEvents = sourceEvents.filter(
  (event) =>
    event.type === "tool_call" &&
    typeof event.payload?.name === "string" &&
    event.payload.name.toLowerCase().includes("keeperhub")
)

const directSuccessEvents = keeperHubEvents
  .filter(
    (event) =>
      (event.payload?.name === "keeperhub.directContractCall" ||
        event.payload?.name === "keeperhub.directExecutionStatus") &&
      event.payload?.status === "completed"
  )
  .slice(0, 6)

const workflowEvents = keeperHubEvents
  .filter((event) => (event.payload?.name ?? "").startsWith("keeperhub.workflowWebhook"))
  .slice(0, 4)

const failureRecoveryEvents = keeperHubEvents
  .filter(
    (event) =>
      (event.payload?.name === "keeperhub.directContractCall" ||
        event.payload?.name === "keeperhub.directExecutionStatus") &&
      (event.status === "error" || event.payload?.status === "completed")
  )
  .slice(0, 10)

const scenarios = [
  {
    key: "direct_success",
    id: mkTraceId("direct"),
    shareToken: mkToken(),
    status: "completed",
    inputSummary: "KeeperHub direct execution success path",
    outputSummary: "Execution completed and status telemetry captured.",
    tags: ["demo", "keeperhub", "direct-success"],
    events: directSuccessEvents,
    errorMessage: null,
  },
  {
    key: "workflow_webhook",
    id: mkTraceId("workflow"),
    shareToken: mkToken(),
    status: "failed",
    inputSummary: "KeeperHub workflow webhook trigger path",
    outputSummary: "Webhook trigger attempted; failure reason captured for remediation.",
    tags: ["demo", "keeperhub", "workflow"],
    events: workflowEvents,
    errorMessage: "Workflow trigger failed; see KeeperHub error details in timeline.",
  },
  {
    key: "failure_recovery",
    id: mkTraceId("recovery"),
    shareToken: mkToken(),
    status: "completed",
    inputSummary: "KeeperHub failure and recovery path",
    outputSummary: "Initial failures observed, then successful execution and completed status.",
    tags: ["demo", "keeperhub", "failure-recovery"],
    events: failureRecoveryEvents,
    errorMessage: null,
  },
]

for (const scenario of scenarios) {
  if (scenario.events.length === 0) {
    throw new Error(`No KeeperHub events available for scenario '${scenario.key}'.`)
  }

  const minStartedAt = new Date(
    Math.min(...scenario.events.map((event) => new Date(event.startedAt).getTime()))
  )
  const maxEndedMs = Math.max(
    ...scenario.events.map((event) =>
      event.endedAt ? new Date(event.endedAt).getTime() : new Date(event.startedAt).getTime()
    )
  )
  const endedAt = Number.isFinite(maxEndedMs) ? new Date(maxEndedMs) : null
  const durationMs = endedAt ? Math.max(0, endedAt.getTime() - minStartedAt.getTime()) : null
  const toolsCalled = [
    ...new Set(
      scenario.events.map((event) =>
        typeof event.payload?.name === "string" ? event.payload.name : "unknown"
      )
    ),
  ]

  await prisma.trace.create({
    data: {
      id: scenario.id,
      agentId: sourceTrace.agentId,
      chainId: sourceTrace.chainId,
      status: scenario.status,
      startedAt: minStartedAt,
      endedAt,
      durationMs,
      inputSummary: scenario.inputSummary,
      outputSummary: scenario.outputSummary,
      errorMessage: scenario.errorMessage,
      eventCount: scenario.events.length,
      totalTokens: 0,
      totalCostUsd: 0,
      totalGasUsed: "0",
      evmTxCount: 0,
      toolsCalled,
      anchorTxHash: null,
      anchorBlock: null,
      merkleProof: null,
      traceHash: null,
      shareToken: scenario.shareToken,
      tags: scenario.tags,
    },
  })

  await prisma.traceEvent.createMany({
    data: scenario.events.map((event, index) => ({
      id: `${scenario.id}_evt_${index}`,
      traceId: scenario.id,
      parentEventId: null,
      sequence: index,
      type: event.type,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      durationMs: event.durationMs,
      payload: event.payload,
      payloadEncrypted: false,
      status: event.status,
      errorMessage: event.errorMessage,
    })),
  })
}

const output = scenarios.map((scenario) => ({
  key: scenario.key,
  traceId: scenario.id,
  shareToken: scenario.shareToken,
  shareUrl: `http://localhost:3000/share/${scenario.shareToken}`,
  eventCount: scenario.events.length,
}))

console.log(JSON.stringify(output, null, 2))

await prisma.$disconnect()
