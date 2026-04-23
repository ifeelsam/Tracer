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

export interface Counterfactual {
  question: string
  answer: string
  verdict: "avoidable" | "unavoidable" | "unclear"
  evidence: string
}

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

export interface LLMCallPayload {
  provider: string
  model: string
  systemPrompt: string | null
  prompt: string | null
  messages: unknown[]
  response: unknown
  reasoning: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  latencyMs: number | null
  metadata: Record<string, unknown> | null
}

export interface EvmTokenTransfer {
  token: string
  symbol: string | null
  decimals: number | null
  from: string
  to: string
  amount: string
  amountFormatted: string
}

export interface EvmLog {
  address: string
  topics: string[]
  data: string
  eventName: string | null
  decoded: Record<string, unknown> | null
}

export interface EvmTxPayload {
  hash: string
  chainId: number
  chainName: string
  from: string
  to: string | null
  value: string
  valueFormatted: string
  data: string
  gasLimit: string
  gasUsed: string | null
  gasPrice: string | null
  maxFeePerGas: string | null
  maxPriorityFeePerGas: string | null
  nonce: number
  blockNumber: number | null
  blockExplorerUrl: string
  status: "pending" | "success" | "reverted"
  revertReason: string | null
  decodedFunction: {
    name: string | null
    inputs: Record<string, unknown> | null
  } | null
  tokenTransfers: EvmTokenTransfer[]
  logs: EvmLog[]
}

export interface EvmContractReadPayload {
  chainId: number
  contractAddress: string
  functionName: string
  inputs: unknown[]
  output: unknown
  blockNumber: number | null
}

export interface MarketContextPrice {
  priceUsd: number
  confidence: number | null
  source: string
  fetchedAt: number
}

export interface MarketContextQuote {
  protocol: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  priceImpactPct: number
  route: unknown[]
  capturedAt: number
  responseHash: string
}

export interface MarketContext {
  chainId: number
  timestamp: number
  blockNumber: number
  tokenPrices: Record<string, MarketContextPrice>
  dexQuotes: Record<string, MarketContextQuote>
}

export interface TraceAnalysis {
  id: string
  traceId: string
  failureType: FailureType
  confidence: number
  summary: string
  whatAgentSaw: string
  whatAgentMissed: string
  counterfactuals: Counterfactual[]
  suggestedFix: string
  analyzedAt: Date
  modelUsed: string
  llmProvider: LLMProvider
}
