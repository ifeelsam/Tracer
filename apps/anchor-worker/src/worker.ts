/**
 * The anchor worker entrypoint will poll Redis and commit trace Merkle roots on-chain.
 * It anchors batches per agent so later verification can prove a trace belonged to a signed commit.
 */
import { prisma } from "@tracerlabs/db"
import {
  type MerkleProofStep,
  buildMerkleTree,
  sha256Hex,
  toCanonicalJson,
} from "@tracerlabs/shared"
import { encodeAbiParameters } from "viem"

import { getRedis } from "./lib/redis"
import {
  getAnchorAccount,
  getAnchorAddress,
  getAnchorChainMetadata,
  getAnchorMaxBatchSize,
  getAnchorMaxDataBytes,
  getAnchorMaxGasLimit,
  getAnchorPublicClient,
  getAnchorWalletClient,
} from "./lib/wallet"

interface TraceForAnchor {
  id: string
  agentId: string
  traceHash: string | null
  startedAt: Date
  status: string
  chainId: number
  inputSummary: string
  outputSummary: string | null
  errorMessage: string | null
  events: Array<{
    id: string
    sequence: number
    type: string
    startedAt: Date
    endedAt: Date | null
    durationMs: number | null
    payload: unknown
    status: string
    errorMessage: string | null
  }>
}

interface RetryState {
  attempts: number
  retryAtMs: number
}

const ANCHOR_PENDING_QUEUE = "anchor:pending"
const ANCHOR_DLQ_QUEUE = "anchor:dlq"

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

function uniqueTraceIds(values: string[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === "string" && value.length > 0)
    ),
  ]
}

function backoffMs(attempts: number): number {
  const maxDelayMs = 15 * 60 * 1_000
  return Math.min(maxDelayMs, 1_000 * 2 ** Math.max(0, attempts - 1))
}

function getRetryStateKey(traceId: string): string {
  return `anchor:retry:${traceId}`
}

function getMetricKey(name: string): string {
  return `metrics:anchor-worker:${name}`
}

async function getRetryState(traceId: string): Promise<RetryState | null> {
  const redis = getRedis()
  const raw = await redis.get<string>(getRetryStateKey(traceId))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RetryState>
    if (typeof parsed.attempts !== "number" || typeof parsed.retryAtMs !== "number") {
      return null
    }

    return {
      attempts: parsed.attempts,
      retryAtMs: parsed.retryAtMs,
    }
  } catch {
    return null
  }
}

async function clearRetryState(traceId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(getRetryStateKey(traceId))
}

async function incrementMetric(name: string, delta = 1): Promise<void> {
  const redis = getRedis()
  const key = getMetricKey(name)
  await redis.incrby(key, delta)
}

async function setGauge(name: string, value: number): Promise<void> {
  const redis = getRedis()
  await redis.set(getMetricKey(name), value)
}

async function publishAlert(message: string, metadata: Record<string, unknown>): Promise<void> {
  const redis = getRedis()
  await redis.publish(
    "alerts:ops",
    JSON.stringify({
      service: "anchor-worker",
      severity: "high",
      message,
      metadata,
      timestamp: Date.now(),
    })
  )
}

async function markRetryOrDlq(traceId: string, reason: string): Promise<void> {
  const redis = getRedis()
  const maxAttempts = Number.parseInt(process.env.ANCHOR_MAX_RETRIES ?? "6", 10)
  const retryState = await getRetryState(traceId)
  const attempts = (retryState?.attempts ?? 0) + 1
  if (attempts >= maxAttempts) {
    await redis.lrem(ANCHOR_PENDING_QUEUE, 0, traceId)
    await redis.lpush(
      ANCHOR_DLQ_QUEUE,
      JSON.stringify({
        traceId,
        reason,
        attempts,
        failedAt: Date.now(),
      })
    )
    await clearRetryState(traceId)
    await incrementMetric("dlq_total", 1)
    await publishAlert("Moved anchor trace to DLQ after max retries.", {
      traceId,
      attempts,
      reason,
    })
    return
  }

  const retryAtMs = Date.now() + backoffMs(attempts)
  await redis.set(
    getRetryStateKey(traceId),
    JSON.stringify({
      attempts,
      retryAtMs,
    })
  )
  await incrementMetric("retry_total", 1)
}

async function filterReadyTraceIds(traceIds: string[]): Promise<string[]> {
  const now = Date.now()
  const ready: string[] = []
  for (const traceId of traceIds) {
    const retryState = await getRetryState(traceId)
    if (!retryState || retryState.retryAtMs <= now) {
      ready.push(traceId)
    }
  }

  return ready
}

function serializeTraceForHash(trace: TraceForAnchor) {
  return {
    id: trace.id,
    agentId: trace.agentId,
    chainId: trace.chainId,
    startedAt: trace.startedAt.toISOString(),
    status: trace.status,
    inputSummary: trace.inputSummary,
    outputSummary: trace.outputSummary,
    errorMessage: trace.errorMessage,
    events: trace.events
      .slice()
      .sort((left, right) => left.sequence - right.sequence)
      .map((event) => ({
        id: event.id,
        sequence: event.sequence,
        type: event.type,
        startedAt: event.startedAt.toISOString(),
        endedAt: event.endedAt?.toISOString() ?? null,
        durationMs: event.durationMs,
        payload: event.payload,
        status: event.status,
        errorMessage: event.errorMessage,
      })),
  }
}

function getTraceHash(trace: TraceForAnchor): string {
  return trace.traceHash ?? sha256Hex(toCanonicalJson(serializeTraceForHash(trace)))
}

function groupByAgent(traces: TraceForAnchor[]): Map<string, TraceForAnchor[]> {
  const groups = new Map<string, TraceForAnchor[]>()

  for (const trace of traces) {
    const group = groups.get(trace.agentId)
    if (group) {
      group.push(trace)
      continue
    }

    groups.set(trace.agentId, [trace])
  }

  for (const group of groups.values()) {
    group.sort((left, right) => {
      const delta = left.startedAt.getTime() - right.startedAt.getTime()
      return delta === 0 ? left.id.localeCompare(right.id) : delta
    })
  }

  return groups
}

async function fetchPendingTraces(traceIds: string[]): Promise<TraceForAnchor[]> {
  return prisma.trace.findMany({
    where: {
      id: {
        in: traceIds,
      },
    },
    select: {
      id: true,
      agentId: true,
      traceHash: true,
      startedAt: true,
      status: true,
      chainId: true,
      inputSummary: true,
      outputSummary: true,
      errorMessage: true,
      events: {
        select: {
          id: true,
          sequence: true,
          type: true,
          startedAt: true,
          endedAt: true,
          durationMs: true,
          payload: true,
          status: true,
          errorMessage: true,
        },
      },
    },
  })
}

async function anchorAgentTraces(traces: TraceForAnchor[]): Promise<string[]> {
  if (traces.length === 0) {
    return []
  }
  const maxBatchSize = getAnchorMaxBatchSize()
  if (traces.length > maxBatchSize) {
    throw new Error(`Anchor batch too large (${traces.length} > ${maxBatchSize})`)
  }

  const hashes = traces.map((trace) => getTraceHash(trace))
  const merkleTree = buildMerkleTree(hashes)
  const account = getAnchorAccount()
  const walletClient = getAnchorWalletClient()
  const publicClient = getAnchorPublicClient()

  const data = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint32" }, { type: "string" }],
    [`0x${merkleTree.root}` as `0x${string}`, traces.length, "tracer/v1"]
  )
  const encodedBytes = (data.length - 2) / 2
  const maxDataBytes = getAnchorMaxDataBytes()
  if (encodedBytes > maxDataBytes) {
    throw new Error(`Anchor calldata too large (${encodedBytes} > ${maxDataBytes})`)
  }
  const gasEstimate = await publicClient.estimateGas({
    account,
    to: getAnchorAddress(),
    value: 0n,
    data,
  })
  const maxGasLimit = getAnchorMaxGasLimit()
  if (gasEstimate > maxGasLimit) {
    throw new Error(`Anchor gas estimate too high (${gasEstimate} > ${maxGasLimit})`)
  }

  const txHash = await walletClient.sendTransaction({
    account,
    to: getAnchorAddress(),
    value: 0n,
    data,
  })
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  })

  await prisma.$transaction(
    traces.map((trace, index) => {
      const proof = merkleTree.proofs[index] ?? ([] satisfies MerkleProofStep[])
      const traceHash = hashes[index]
      if (!traceHash) {
        throw new Error(`Missing trace hash for ${trace.id}`)
      }

      return prisma.trace.update({
        where: {
          id: trace.id,
        },
        data: {
          anchorTxHash: txHash,
          anchorBlock: receipt.blockNumber,
          merkleProof: JSON.stringify(proof),
          traceHash,
        },
      })
    })
  )

  return traces.map((trace) => trace.id)
}

async function processAnchorQueue(): Promise<void> {
  const redis = getRedis()
  const pendingTraceIds = uniqueTraceIds(await redis.lrange<string>(ANCHOR_PENDING_QUEUE, 0, -1))
  await setGauge("pending_depth", pendingTraceIds.length)
  const lagAlertThreshold = Number.parseInt(process.env.ANCHOR_QUEUE_ALERT_DEPTH ?? "200", 10)
  if (pendingTraceIds.length >= lagAlertThreshold) {
    await publishAlert("Anchor queue lag exceeds configured threshold.", {
      pendingDepth: pendingTraceIds.length,
    })
  }
  if (pendingTraceIds.length === 0) {
    return
  }
  const readyTraceIds = await filterReadyTraceIds(pendingTraceIds)
  if (readyTraceIds.length === 0) {
    return
  }

  const traces = await fetchPendingTraces(readyTraceIds)
  const grouped = groupByAgent(traces)
  const completedTraceIds: string[] = []

  for (const agentTraces of grouped.values()) {
    try {
      const anchoredTraceIds = await anchorAgentTraces(agentTraces)
      completedTraceIds.push(...anchoredTraceIds)
      await incrementMetric("anchored_total", anchoredTraceIds.length)
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown_error"
      console.warn(
        `[anchor-worker] failed to anchor traces for agent ${agentTraces[0]?.agentId ?? "unknown"}`,
        error
      )
      for (const trace of agentTraces) {
        await markRetryOrDlq(trace.id, reason)
      }
    }
  }

  for (const traceId of completedTraceIds) {
    await redis.lrem(ANCHOR_PENDING_QUEUE, 0, traceId)
    await clearRetryState(traceId)
  }
}

async function start() {
  const anchorChain = getAnchorChainMetadata()
  console.log(`[anchor-worker] anchoring on ${anchorChain.name} (${anchorChain.id})`)

  for (;;) {
    try {
      await processAnchorQueue()
    } catch (error) {
      console.warn("[anchor-worker] queue iteration failed", error)
    }

    await sleep(60_000)
  }
}

void start()
