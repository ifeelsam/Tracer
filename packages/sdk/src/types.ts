/**
 * These types describe the SDK's runtime configuration and buffered ingest payload shape.
 * They stay transport-focused so wrappers can emit events without knowing about HTTP details.
 */
import type { EventType, Trace, TraceEvent } from "@tracerlabs/shared"

export interface TracerConfig {
  apiKey: string
  agentId: string
  chainId: number
  environment: "testnet" | "mainnet"
  endpoint?: string
  bufferMs?: number
  bufferBytes?: number
  privateMode?: boolean
  captureMarket?: boolean
  verifyToken?: string
}

export interface SessionStartOptions {
  traceId?: string
  inputSummary: string
  outputSummary?: string
  tags?: string[]
  toolsCalled?: string[]
}

export interface BufferedTraceRecord {
  trace: Trace
  events: TraceEvent[]
  privateMode: boolean
  environment: "testnet" | "mainnet"
  verifyToken: string | undefined
}

export interface TraceBatchRequest {
  agentId: string
  chainId: number
  environment: "testnet" | "mainnet"
  traces: BufferedTraceRecord[]
}

export interface TracerWarningContext {
  scope: "buffer" | "session" | "instrumentation"
  message: string
}

export interface EventBuilderState {
  id: string
  parentEventId: string | null
  sequence: number
  type: EventType
  payload: unknown
  startedAt: Date
}
