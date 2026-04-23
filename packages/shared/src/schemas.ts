/**
 * These schemas validate the shared Tracer payloads at package boundaries and ingest time.
 * They mirror the TypeScript types so apps can safely parse untrusted input before use.
 */
import { z } from "zod"

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(jsonValueSchema)])
)

export const eventTypeSchema = z.enum([
  "llm_call",
  "tool_call",
  "evm_tx",
  "evm_contract_read",
  "x402_payment",
  "mcp_call",
  "custom",
])

export const traceStatusSchema = z.enum(["running", "completed", "errored", "timeout"])

export const failureTypeSchema = z.enum([
  "missing_information",
  "bad_instruction",
  "guardrail_gap",
  "model_limit",
  "market_condition",
  "revert",
  "gas_estimation_failed",
  "unknown",
])

export const llmProviderSchema = z.enum(["anthropic", "ollama"])

export const userPlanSchema = z.enum(["free", "pro", "team"])

export const counterfactualSchema = z.object({
  question: z.string(),
  answer: z.string(),
  verdict: z.enum(["avoidable", "unavoidable", "unclear"]),
  evidence: z.string(),
})

export const agentSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  agentWallet: z.string().nullable(),
  displayName: z.string(),
  apiKeyHash: z.string(),
  chainId: z.number().int(),
  environment: z.enum(["testnet", "mainnet"]),
  privateMode: z.boolean(),
  retentionDays: z.number().int(),
  verifyToken: z.string(),
  verified: z.boolean(),
  verifiedAt: z.date().nullable(),
  createdAt: z.date(),
})

export const traceSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  chainId: z.number().int(),
  status: traceStatusSchema,
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationMs: z.number().int().nullable(),
  inputSummary: z.string(),
  outputSummary: z.string().nullable(),
  errorMessage: z.string().nullable(),
  eventCount: z.number().int(),
  totalTokens: z.number().int(),
  totalCostUsd: z.string(),
  totalGasUsed: z.string(),
  evmTxCount: z.number().int(),
  toolsCalled: z.array(z.string()),
  anchorTxHash: z.string().nullable(),
  anchorBlock: z.bigint().nullable(),
  merkleProof: z.string().nullable(),
  traceHash: z.string().nullable(),
  shareToken: z.string().nullable(),
  tags: z.array(z.string()),
})

export const traceEventSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentEventId: z.string().nullable(),
  sequence: z.number().int(),
  type: eventTypeSchema,
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationMs: z.number().int().nullable(),
  payload: z.unknown(),
  payloadEncrypted: z.boolean(),
  status: z.string(),
  errorMessage: z.string().nullable(),
})

export const llmCallPayloadSchema = z.object({
  provider: z.string(),
  model: z.string(),
  systemPrompt: z.string().nullable(),
  prompt: z.string().nullable(),
  messages: z.array(z.unknown()),
  response: z.unknown(),
  reasoning: z.string().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  totalTokens: z.number().int().nullable(),
  costUsd: z.number().nullable(),
  latencyMs: z.number().int().nullable(),
  metadata: z.record(z.unknown()).nullable(),
})

export const evmTokenTransferSchema = z.object({
  token: z.string(),
  symbol: z.string().nullable(),
  decimals: z.number().int().nullable(),
  from: z.string(),
  to: z.string(),
  amount: z.string(),
  amountFormatted: z.string(),
})

export const evmLogSchema = z.object({
  address: z.string(),
  topics: z.array(z.string()),
  data: z.string(),
  eventName: z.string().nullable(),
  decoded: z.record(z.unknown()).nullable(),
})

export const evmTxPayloadSchema = z.object({
  hash: z.string(),
  chainId: z.number().int(),
  chainName: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  value: z.string(),
  valueFormatted: z.string(),
  data: z.string(),
  gasLimit: z.string(),
  gasUsed: z.string().nullable(),
  gasPrice: z.string().nullable(),
  maxFeePerGas: z.string().nullable(),
  maxPriorityFeePerGas: z.string().nullable(),
  nonce: z.number().int(),
  blockNumber: z.number().int().nullable(),
  blockExplorerUrl: z.string().url(),
  status: z.enum(["pending", "success", "reverted"]),
  revertReason: z.string().nullable(),
  decodedFunction: z
    .object({
      name: z.string().nullable(),
      inputs: z.record(z.unknown()).nullable(),
    })
    .nullable(),
  tokenTransfers: z.array(evmTokenTransferSchema),
  logs: z.array(evmLogSchema),
})

export const evmContractReadPayloadSchema = z.object({
  chainId: z.number().int(),
  contractAddress: z.string(),
  functionName: z.string(),
  inputs: z.array(z.unknown()),
  output: z.unknown(),
  blockNumber: z.number().int().nullable(),
})

export const marketContextPriceSchema = z.object({
  priceUsd: z.number(),
  confidence: z.number().nullable(),
  source: z.string(),
  fetchedAt: z.number().int(),
})

export const marketContextQuoteSchema = z.object({
  protocol: z.string(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  amountOut: z.string(),
  priceImpactPct: z.number(),
  route: z.array(z.unknown()),
  capturedAt: z.number().int(),
  responseHash: z.string(),
})

export const marketContextSchema = z.object({
  chainId: z.number().int(),
  timestamp: z.number().int(),
  blockNumber: z.number().int(),
  tokenPrices: z.record(marketContextPriceSchema),
  dexQuotes: z.record(marketContextQuoteSchema),
})

export const traceAnalysisSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  failureType: failureTypeSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  whatAgentSaw: z.string(),
  whatAgentMissed: z.string(),
  counterfactuals: z.array(counterfactualSchema),
  suggestedFix: z.string(),
  analyzedAt: z.date(),
  modelUsed: z.string(),
  llmProvider: llmProviderSchema,
})
