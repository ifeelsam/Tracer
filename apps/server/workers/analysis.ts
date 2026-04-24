/**
 * The analysis worker consumes queued trace ids and persists structured LLM debugging output.
 * It uses the env-selected provider so analysis can switch between Anthropic and Ollama without code changes.
 */
import { prisma } from "@tracerlabs/db"
import { getChain } from "@tracerlabs/shared"
import { z } from "zod"

import { getLLMClient } from "../lib/llm"
import { getRedis } from "../lib/redis"

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
    try {
      const traceId = await redis.rpop<string>("analysis:pending")
      if (!traceId) {
        await sleep(15_000)
        continue
      }

      await analyzeTrace(traceId)
      await redis.publish(`analysis:ready:${traceId}`, JSON.stringify({ traceId }))
    } catch (error) {
      console.warn("[analysis-worker] analysis iteration failed", error)
      await sleep(5_000)
    }
  }
}

void start()
