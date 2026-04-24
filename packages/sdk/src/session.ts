/**
 * Sessions accumulate a trace's metadata and events before handing them to the buffer.
 * They own nesting state so independent wrappers can emit well-ordered child events.
 */
import type { EventType, Trace, TraceEvent, TraceStatus } from "@tracerlabs/shared"
import { ulid } from "ulid"

import type { TraceBuffer } from "./buffer"
import { runWithSession } from "./context"
import { EventBuilder } from "./event-builder"
import type { BufferedTraceRecord, SessionStartOptions, TracerConfig } from "./types"

function parseBigIntString(value: unknown): bigint | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

function computeTraceRollups(events: TraceEvent[]): {
  totalTokens: number
  totalCostUsd: string
  totalGasUsed: string
} {
  let totalTokens = 0
  let totalCostUsd = 0
  let totalGasUsed = 0n

  for (const event of events) {
    if (event.type === "llm_call" && event.payload && typeof event.payload === "object") {
      const payload = event.payload as Record<string, unknown>
      const tokens =
        typeof payload.totalTokens === "number"
          ? payload.totalTokens
          : typeof payload.inputTokens === "number" && typeof payload.outputTokens === "number"
            ? payload.inputTokens + payload.outputTokens
            : null
      if (typeof tokens === "number" && Number.isFinite(tokens)) {
        totalTokens += Math.max(0, Math.trunc(tokens))
      }

      const costUsd = typeof payload.costUsd === "number" ? payload.costUsd : null
      if (typeof costUsd === "number" && Number.isFinite(costUsd)) {
        totalCostUsd += Math.max(0, costUsd)
      }
    }

    if (event.type === "evm_tx" && event.payload && typeof event.payload === "object") {
      const payload = event.payload as Record<string, unknown>
      const gasUsed = parseBigIntString(payload.gasUsed)
      if (gasUsed !== null && gasUsed >= 0n) {
        totalGasUsed += gasUsed
      }
    }
  }

  return {
    totalTokens,
    totalCostUsd: totalCostUsd.toFixed(6),
    totalGasUsed: totalGasUsed.toString(),
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error"
}

export class Session {
  private readonly buffer: TraceBuffer
  private readonly config: TracerConfig
  private readonly traceId: string
  private readonly startedAt: Date
  private readonly tags: string[]
  private readonly toolsCalled = new Set<string>()
  private readonly eventStack: string[] = []
  private readonly events: TraceEvent[] = []
  private endedAt: Date | null = null
  private inputSummary: string
  private outputSummary: string | null
  private errorMessage: string | null = null
  private status: TraceStatus = "running"
  private sequence = 0

  constructor(config: TracerConfig, buffer: TraceBuffer, options: SessionStartOptions) {
    this.buffer = buffer
    this.config = config
    this.traceId = options.traceId ?? ulid()
    this.startedAt = new Date()
    this.inputSummary = options.inputSummary
    this.outputSummary = options.outputSummary ?? null
    this.tags = options.tags ?? []

    for (const toolName of options.toolsCalled ?? []) {
      this.toolsCalled.add(toolName)
    }
  }

  get id(): string {
    return this.traceId
  }

  run<T>(callback: () => Promise<T> | T): Promise<T> | T {
    return runWithSession(this, callback)
  }

  beginEvent(type: EventType, payload: unknown): EventBuilder {
    const builder = new EventBuilder(
      {
        id: ulid(),
        parentEventId: this.eventStack.at(-1) ?? null,
        sequence: this.sequence++,
        type,
        payload,
        startedAt: new Date(),
      },
      {
        onFinalize: (event) => {
          this.finalizeEvent(event)
        },
      }
    )

    this.eventStack.push(builder.id)
    return builder
  }

  setOutputSummary(outputSummary: string): void {
    this.outputSummary = outputSummary
  }

  addTool(name: string): void {
    this.toolsCalled.add(name)
  }

  patchEvent(eventId: string, updater: (event: TraceEvent) => TraceEvent): void {
    const eventIndex = this.events.findIndex((event) => event.id === eventId)
    if (eventIndex < 0) {
      return
    }

    const event = this.events[eventIndex]
    if (!event) {
      return
    }

    this.events[eventIndex] = updater(event)
  }

  complete(outputSummary?: string): void {
    if (this.endedAt) {
      return
    }

    if (outputSummary) {
      this.outputSummary = outputSummary
    }

    this.status = "completed"
    this.flushTrace()
  }

  fail(error: unknown): void {
    if (this.endedAt) {
      return
    }

    this.status = "errored"
    this.errorMessage = normalizeErrorMessage(error)
    this.flushTrace()
  }

  private finalizeEvent(event: TraceEvent): void {
    const stackIndex = this.eventStack.lastIndexOf(event.id)
    if (stackIndex >= 0) {
      this.eventStack.splice(stackIndex, 1)
    }

    if (event.type === "tool_call") {
      const payload = event.payload
      if (
        payload &&
        typeof payload === "object" &&
        "name" in payload &&
        typeof payload.name === "string"
      ) {
        this.toolsCalled.add(payload.name)
      }
    }

    this.events.push({
      ...event,
      traceId: this.traceId,
    })
  }

  private flushTrace(): void {
    this.endedAt = new Date()
    const rollups = computeTraceRollups(this.events)
    const trace: Trace = {
      id: this.traceId,
      agentId: this.config.agentId,
      chainId: this.config.chainId,
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs: this.endedAt.getTime() - this.startedAt.getTime(),
      inputSummary: this.inputSummary,
      outputSummary: this.outputSummary,
      errorMessage: this.errorMessage,
      eventCount: this.events.length,
      totalTokens: rollups.totalTokens,
      totalCostUsd: rollups.totalCostUsd,
      totalGasUsed: rollups.totalGasUsed,
      evmTxCount: this.events.filter((event) => event.type === "evm_tx").length,
      toolsCalled: [...this.toolsCalled],
      anchorTxHash: null,
      anchorBlock: null,
      merkleProof: null,
      traceHash: null,
      shareToken: null,
      tags: this.tags,
    }

    const record: BufferedTraceRecord = {
      trace,
      events: this.events,
      privateMode: this.config.privateMode ?? false,
      environment: this.config.environment,
      verifyToken: this.config.verifyToken,
    }

    this.buffer.enqueue(record)
  }
}
