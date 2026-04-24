/**
 * These request schemas coerce JSON payloads from the SDK into the runtime shapes Prisma expects.
 * They intentionally accept ISO date strings because traces are sent over HTTP, not by direct import.
 */
import {
  eventTypeSchema,
  evmContractReadPayloadSchema,
  evmTxPayloadSchema,
  jsonValueSchema,
  llmCallPayloadSchema,
} from "@tracerlabs/shared"
import { z } from "zod"

const unknownRecordSchema = z.record(z.unknown())

export const traceEventInputSchema = z
  .object({
    id: z.string(),
    traceId: z.string(),
    parentEventId: z.string().nullable(),
    sequence: z.number().int(),
    type: eventTypeSchema,
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date().nullable(),
    durationMs: z.number().int().nullable(),
    payload: z.unknown(),
    payloadEncrypted: z.boolean(),
    status: z.string(),
    errorMessage: z.string().nullable(),
  })
  .superRefine((event, ctx) => {
    // Enforce payload shape for the critical EVM surfaces so the dashboard and analysis worker
    // can rely on consistent fields even when ingest receives untrusted input.
    if (event.payloadEncrypted) {
      return
    }

    const payload = event.payload
    if (event.type === "evm_tx") {
      const parsed = evmTxPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid evm_tx payload",
        })
      }
      return
    }

    if (event.type === "evm_contract_read") {
      const parsed = evmContractReadPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid evm_contract_read payload",
        })
      }
      return
    }

    if (event.type === "llm_call") {
      const parsed = llmCallPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid llm_call payload",
        })
      }
      return
    }

    // For other event types, ensure the payload is JSON-serializable (Prisma JSON field).
    const jsonParsed = jsonValueSchema.safeParse(payload)
    if (!jsonParsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Event payload must be JSON-serializable",
      })
    }
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
