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
  getAnchorAddress,
  getAnchorChainMetadata,
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

  const hashes = traces.map((trace) => getTraceHash(trace))
  const merkleTree = buildMerkleTree(hashes)
  const walletClient = getAnchorWalletClient()
  const publicClient = getAnchorPublicClient()

  const data = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint32" }, { type: "string" }],
    [`0x${merkleTree.root}` as `0x${string}`, traces.length, "tracer/v1"]
  )

  const txHash = await walletClient.sendTransaction({
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
  const pendingTraceIds = uniqueTraceIds(await redis.lrange<string>("anchor:pending", 0, -1))
  if (pendingTraceIds.length === 0) {
    return
  }

  const traces = await fetchPendingTraces(pendingTraceIds)
  const grouped = groupByAgent(traces)
  const completedTraceIds: string[] = []

  for (const agentTraces of grouped.values()) {
    try {
      const anchoredTraceIds = await anchorAgentTraces(agentTraces)
      completedTraceIds.push(...anchoredTraceIds)
    } catch (error) {
      console.warn(
        `[anchor-worker] failed to anchor traces for agent ${agentTraces[0]?.agentId ?? "unknown"}`,
        error
      )
    }
  }

  for (const traceId of completedTraceIds) {
    await redis.lrem("anchor:pending", 0, traceId)
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
