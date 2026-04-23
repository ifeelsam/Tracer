/**
 * Event builders capture timing and parent-child relationships for nested trace events.
 * They finalize exactly once so wrappers can safely call complete or fail from any branch.
 */
import type { EventType, TraceEvent } from "@tracerlabs/shared"

import type { EventBuilderState } from "./types"

interface EventBuilderCallbacks {
  onFinalize: (event: TraceEvent) => void
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

export class EventBuilder {
  private readonly state: EventBuilderState
  private readonly callbacks: EventBuilderCallbacks
  private finalized = false

  constructor(state: EventBuilderState, callbacks: EventBuilderCallbacks) {
    this.state = state
    this.callbacks = callbacks
  }

  get id(): string {
    return this.state.id
  }

  get type(): EventType {
    return this.state.type
  }

  complete(payload: unknown = this.state.payload, status = "ok"): void {
    if (this.finalized) {
      return
    }

    this.finalized = true
    const endedAt = new Date()
    this.callbacks.onFinalize({
      id: this.state.id,
      traceId: "",
      parentEventId: this.state.parentEventId,
      sequence: this.state.sequence,
      type: this.state.type,
      startedAt: this.state.startedAt,
      endedAt,
      durationMs: endedAt.getTime() - this.state.startedAt.getTime(),
      payload,
      payloadEncrypted: false,
      status,
      errorMessage: null,
    })
  }

  fail(error: unknown, payload: unknown = this.state.payload): void {
    if (this.finalized) {
      return
    }

    this.finalized = true
    const endedAt = new Date()
    this.callbacks.onFinalize({
      id: this.state.id,
      traceId: "",
      parentEventId: this.state.parentEventId,
      sequence: this.state.sequence,
      type: this.state.type,
      startedAt: this.state.startedAt,
      endedAt,
      durationMs: endedAt.getTime() - this.state.startedAt.getTime(),
      payload,
      payloadEncrypted: false,
      status: "error",
      errorMessage: normalizeErrorMessage(error),
    })
  }
}
