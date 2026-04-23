/**
 * These shared types define the core trace and agent model used across the Tracer monorepo.
 * They intentionally avoid runtime dependencies so they can be imported from any package.
 */
export type EventType =
  | "llm_call"
  | "tool_call"
  | "evm_tx"
  | "evm_contract_read"
  | "x402_payment"
  | "mcp_call"
  | "custom"

export type TraceStatus = "running" | "completed" | "errored" | "timeout"

export type FailureType =
  | "missing_information"
  | "bad_instruction"
  | "guardrail_gap"
  | "model_limit"
  | "market_condition"
  | "revert"
  | "gas_estimation_failed"
  | "unknown"

export type LLMProvider = "anthropic" | "ollama"

export type UserPlan = "free" | "pro" | "team"

export interface Agent {
  id: string
  ownerId: string
  agentWallet: string | null
  displayName: string
  apiKeyHash: string
  chainId: number
  environment: "testnet" | "mainnet"
  privateMode: boolean
  retentionDays: number
  verifyToken: string
  verified: boolean
  verifiedAt: Date | null
  createdAt: Date
}

export interface Trace {
  id: string
  agentId: string
  chainId: number
  status: TraceStatus
  startedAt: Date
  endedAt: Date | null
  durationMs: number | null
  inputSummary: string
  outputSummary: string | null
  errorMessage: string | null
  eventCount: number
  totalTokens: number
  totalCostUsd: string
  totalGasUsed: string
  evmTxCount: number
  toolsCalled: string[]
  anchorTxHash: string | null
  anchorBlock: bigint | null
  merkleProof: string | null
  traceHash: string | null
  shareToken: string | null
  tags: string[]
}

export interface TraceEvent {
  id: string
  traceId: string
  parentEventId: string | null
  sequence: number
  type: EventType
  startedAt: Date
  endedAt: Date | null
  durationMs: number | null
  payload: unknown
  payloadEncrypted: boolean
  status: string
  errorMessage: string | null
}

export interface TraceAnalysisRecord {
  id: string
  traceId: string
  failureType: FailureType
  confidence: number
  summary: string
  whatAgentSaw: string
  whatAgentMissed: string
  counterfactuals: unknown
  suggestedFix: string
  analyzedAt: Date
  modelUsed: string
  llmProvider: LLMProvider
}
