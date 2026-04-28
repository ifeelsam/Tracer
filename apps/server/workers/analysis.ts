/**
 * The analysis worker consumes queued trace ids and persists structured LLM debugging output.
 * It uses the env-selected provider so analysis can switch between Anthropic and Ollama without code changes.
 */
import { prisma } from "@tracerlabs/db"
import { getChain } from "@tracerlabs/shared"
import { z } from "zod"

import { getLLMClient } from "../lib/llm"
import { getRedis } from "../lib/redis"

const ANALYSIS_PENDING_QUEUE = "analysis:pending"
const ANALYSIS_DLQ_QUEUE = "analysis:dlq"

const analysisSchema = z.object({
  failureType: z.enum([
    "missing_information",
    "bad_instruction",
    "guardrail_gap",
    "model_limit",
    "market_condition",
    "revert",
    "gas_estimation_failed",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  whatAgentSaw: z.string(),
  whatAgentMissed: z.string(),
  counterfactuals: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      verdict: z.enum(["avoidable", "unavoidable", "unclear"]),
      evidence: z.string(),
    })
  ),
  suggestedFix: z.string(),
})

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

function backoffMs(attempts: number): number {
  const maxDelayMs = 10 * 60 * 1_000
  return Math.min(maxDelayMs, 1_000 * 2 ** Math.max(0, attempts - 1))
}

function getRetryStateKey(traceId: string): string {
  return `analysis:retry:${traceId}`
}

function getMetricKey(name: string): string {
  return `metrics:analysis-worker:${name}`
}

async function incrementMetric(name: string, delta = 1): Promise<void> {
  const redis = getRedis()
  await redis.incrby(getMetricKey(name), delta)
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
      service: "analysis-worker",
      severity: "high",
      message,
      metadata,
      timestamp: Date.now(),
    })
  )
}

async function markRetryOrDlq(traceId: string, reason: string): Promise<void> {
  const redis = getRedis()
  const maxAttempts = Number.parseInt(process.env.ANALYSIS_MAX_RETRIES ?? "6", 10)
  const raw = await redis.get<string>(getRetryStateKey(traceId))
  let attempts = 1
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { attempts?: number }
      attempts = (parsed.attempts ?? 0) + 1
    } catch {
      attempts = 1
    }
  }

  if (attempts >= maxAttempts) {
    await redis.lpush(
      ANALYSIS_DLQ_QUEUE,
      JSON.stringify({
        traceId,
        reason,
        attempts,
        failedAt: Date.now(),
      })
    )
    await redis.del(getRetryStateKey(traceId))
    await incrementMetric("dlq_total")
    await publishAlert("Moved analysis trace to DLQ after max retries.", {
      traceId,
      attempts,
      reason,
    })
    return
  }

  await redis.set(
    getRetryStateKey(traceId),
    JSON.stringify({
      attempts,
      retryAtMs: Date.now() + backoffMs(attempts),
    })
  )
  await redis.lpush(ANALYSIS_PENDING_QUEUE, traceId)
  await incrementMetric("retry_total")
}

async function shouldProcessNow(traceId: string): Promise<boolean> {
  const redis = getRedis()
  const raw = await redis.get<string>(getRetryStateKey(traceId))
  if (!raw) {
    return true
  }

  try {
    const parsed = JSON.parse(raw) as { retryAtMs?: number }
    if (typeof parsed.retryAtMs !== "number") {
      return true
    }
    return parsed.retryAtMs <= Date.now()
  } catch {
    return true
  }
}

async function clearRetryState(traceId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(getRetryStateKey(traceId))
}

function stringifyPayload(value: unknown): string {
  return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2)
}

function summarizeEvent(event: {
  sequence: number
  type: string
  durationMs: number | null
  status: string
  payload: unknown
  errorMessage: string | null
}) {
  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : {}

  if (event.type === "llm_call") {
    return [
      `[${event.sequence}] llm_call — ${event.durationMs ?? 0}ms — ${event.status}`,
      `model=${typeof payload.model === "string" ? payload.model : "unknown"}`,
      `reasoning=${typeof payload.reasoning === "string" ? payload.reasoning : "n/a"}`,
    ].join("\n")
  }

  if (event.type === "tool_call") {
    return [
      `[${event.sequence}] tool_call — ${event.durationMs ?? 0}ms — ${event.status}`,
      `payload=${stringifyPayload(payload)}`,
      `error=${event.errorMessage ?? "n/a"}`,
    ].join("\n")
  }

  if (event.type === "evm_tx") {
    return [
      `[${event.sequence}] evm_tx — ${event.durationMs ?? 0}ms — ${event.status}`,
      `to=${typeof payload.to === "string" ? payload.to : "n/a"}`,
      `value=${typeof payload.valueFormatted === "string" ? payload.valueFormatted : "n/a"}`,
      `function=${payload.decodedFunction && typeof payload.decodedFunction === "object" && "name" in payload.decodedFunction ? String(payload.decodedFunction.name) : "n/a"}`,
      `gasUsed=${typeof payload.gasUsed === "string" ? payload.gasUsed : "n/a"}`,
      `revertReason=${typeof payload.revertReason === "string" ? payload.revertReason : "n/a"}`,
    ].join("\n")
  }

  if (event.type === "evm_contract_read") {
    return [
      `[${event.sequence}] evm_contract_read — ${event.durationMs ?? 0}ms — ${event.status}`,
      `contract=${typeof payload.contractAddress === "string" ? payload.contractAddress : "n/a"}`,
      `function=${typeof payload.functionName === "string" ? payload.functionName : "n/a"}`,
      `result=${stringifyPayload("output" in payload ? payload.output : null)}`,
    ].join("\n")
  }

  return [
    `[${event.sequence}] ${event.type} — ${event.durationMs ?? 0}ms — ${event.status}`,
    `payload=${stringifyPayload(payload)}`,
  ].join("\n")
}

function collectMarketContext(events: Array<{ payload: unknown }>): string {
  const contexts = events.flatMap((event) => {
    const payload =
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {}
    if ("marketContext" in payload) {
      return [stringifyPayload(payload.marketContext)]
    }

    return []
  })

  return contexts.length > 0 ? contexts.join("\n---\n") : "No explicit market context captured."
}

async function analyzeTrace(traceId: string): Promise<void> {
  const trace = await prisma.trace.findUnique({
    where: {
      id: traceId,
    },
    include: {
      events: {
        orderBy: {
          sequence: "asc",
        },
      },
    },
  })

  if (!trace) {
    return
  }

  const chain = getChain(trace.chainId)
  const prompt = [
    `CHAIN: ${chain.name} (chainId: ${chain.id})`,
    "",
    "TRACE SUMMARY:",
    stringifyPayload({
      status: trace.status,
      duration: trace.durationMs,
      inputSummary: trace.inputSummary,
      errorMessage: trace.errorMessage,
    }),
    "",
    "AGENT DECISIONS (chronological):",
    trace.events
      .map((event: Parameters<typeof summarizeEvent>[0]) => summarizeEvent(event))
      .join("\n\n"),
    "",
    "MARKET CONTEXT AT EACH LLM DECISION:",
    collectMarketContext(trace.events),
    "",
    "GAS CONTEXT:",
    stringifyPayload({
      totalGasUsed: trace.totalGasUsed,
      evmTxCount: trace.evmTxCount,
      estimatedCostUsd: trace.totalCostUsd,
    }),
  ].join("\n")

  const client = getLLMClient()
  const response = await client.generateJson<z.infer<typeof analysisSchema>>({
    system:
      "You are an expert EVM DeFi agent debugger. Analyze the trace and respond ONLY with valid JSON.",
    user: `${prompt}

Respond with ONLY this JSON:
{
  "failureType": "missing_information" | "bad_instruction" | "guardrail_gap" | "model_limit" | "market_condition" | "revert" | "gas_estimation_failed" | "unknown",
  "confidence": 0,
  "summary": "2-3 sentences",
  "whatAgentSaw": "...",
  "whatAgentMissed": "...",
  "counterfactuals": [
    {
      "question": "string",
      "answer": "string",
      "verdict": "avoidable" | "unavoidable" | "unclear",
      "evidence": "string"
    }
  ],
  "suggestedFix": "..."
}`,
  })

  const parsedResult = analysisSchema.safeParse(response)
  if (!parsedResult.success) {
    console.warn("[analysis-worker] model returned invalid analysis JSON")
    await prisma.traceAnalysis.upsert({
      where: {
        traceId: trace.id,
      },
      create: {
        id: `${trace.id}_analysis`,
        traceId: trace.id,
        failureType: "unknown",
        confidence: 0.2,
        summary:
          "Automated analysis failed to parse. See trace timeline and raw events for details.",
        whatAgentSaw:
          "The analysis worker received the trace but could not validate the model output.",
        whatAgentMissed: "The model response did not match the required JSON schema.",
        counterfactuals: [],
        suggestedFix:
          "Re-run analysis after confirming LLM provider configuration and prompt integrity.",
        analyzedAt: new Date(),
        modelUsed: client.model,
        llmProvider: client.provider,
      },
      update: {
        failureType: "unknown",
        confidence: 0.2,
        summary:
          "Automated analysis failed to parse. See trace timeline and raw events for details.",
        whatAgentSaw:
          "The analysis worker received the trace but could not validate the model output.",
        whatAgentMissed: "The model response did not match the required JSON schema.",
        counterfactuals: [],
        suggestedFix:
          "Re-run analysis after confirming LLM provider configuration and prompt integrity.",
        analyzedAt: new Date(),
        modelUsed: client.model,
        llmProvider: client.provider,
      },
    })
    return
  }

  const parsed = parsedResult.data

  await prisma.traceAnalysis.upsert({
    where: {
      traceId: trace.id,
    },
    create: {
      id: `${trace.id}_analysis`,
      traceId: trace.id,
      failureType: parsed.failureType,
      confidence: parsed.confidence,
      summary: parsed.summary,
      whatAgentSaw: parsed.whatAgentSaw,
      whatAgentMissed: parsed.whatAgentMissed,
      counterfactuals: parsed.counterfactuals,
      suggestedFix: parsed.suggestedFix,
      analyzedAt: new Date(),
      modelUsed: client.model,
      llmProvider: client.provider,
    },
    update: {
      failureType: parsed.failureType,
      confidence: parsed.confidence,
      summary: parsed.summary,
      whatAgentSaw: parsed.whatAgentSaw,
      whatAgentMissed: parsed.whatAgentMissed,
      counterfactuals: parsed.counterfactuals,
      suggestedFix: parsed.suggestedFix,
      analyzedAt: new Date(),
      modelUsed: client.model,
      llmProvider: client.provider,
    },
  })
}

async function start() {
  const redis = getRedis()

  for (;;) {
    let traceId: string | null = null
    try {
      const pendingDepth = await redis.llen(ANALYSIS_PENDING_QUEUE)
      await setGauge("pending_depth", pendingDepth)
      const lagAlertThreshold = Number.parseInt(process.env.ANALYSIS_QUEUE_ALERT_DEPTH ?? "200", 10)
      if (pendingDepth >= lagAlertThreshold) {
        await publishAlert("Analysis queue lag exceeds configured threshold.", { pendingDepth })
      }
      traceId = await redis.rpop<string>(ANALYSIS_PENDING_QUEUE)
      if (!traceId) {
        await sleep(15_000)
        continue
      }
      const shouldProcess = await shouldProcessNow(traceId)
      if (!shouldProcess) {
        await redis.lpush(ANALYSIS_PENDING_QUEUE, traceId)
        await sleep(1_000)
        continue
      }

      await analyzeTrace(traceId)
      await clearRetryState(traceId)
      await incrementMetric("processed_total")
      await redis.publish(`analysis:ready:${traceId}`, JSON.stringify({ traceId }))
    } catch (error) {
      console.warn("[analysis-worker] analysis iteration failed", error)
      if (traceId) {
        await markRetryOrDlq(traceId, error instanceof Error ? error.message : "unknown_error")
      }
      await sleep(2_000)
    }
  }
}

void start()
