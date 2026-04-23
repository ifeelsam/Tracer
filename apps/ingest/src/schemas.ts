/**
 * These request schemas coerce JSON payloads from the SDK into the runtime shapes Prisma expects.
 * They intentionally accept ISO date strings because traces are sent over HTTP, not by direct import.
 */
import { z } from "zod"

const unknownRecordSchema = z.record(z.unknown())

export const traceEventInputSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentEventId: z.string().nullable(),
  sequence: z.number().int(),
  type: z.string(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  durationMs: z.number().int().nullable(),
  payload: z.unknown(),
  payloadEncrypted: z.boolean(),
  status: z.string(),
  errorMessage: z.string().nullable(),
})

export const traceInputSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  chainId: z.number().int(),
  status: z.string(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
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
  anchorBlock: z
    .bigint()
    .nullable()
    .or(z.string().transform((value) => BigInt(value)))
    .nullable(),
  merkleProof: z.string().nullable(),
  traceHash: z.string().nullable(),
  shareToken: z.string().nullable(),
  tags: z.array(z.string()),
})

export const bufferedTraceSchema = z.object({
  trace: traceInputSchema,
  events: z.array(traceEventInputSchema),
  privateMode: z.boolean(),
  environment: z.enum(["testnet", "mainnet"]),
  verifyToken: z.string().optional(),
})

export const traceBatchRequestSchema = z.object({
  agentId: z.string(),
  chainId: z.number().int(),
  environment: z.enum(["testnet", "mainnet"]),
  traces: z.array(bufferedTraceSchema).min(1),
})

export const traceCompleteRequestSchema = z.object({
  status: z.enum(["completed", "errored", "timeout"]),
  endedAt: z.coerce.date(),
  durationMs: z.number().int().nullable().optional(),
  outputSummary: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadata: unknownRecordSchema.optional(),
})
