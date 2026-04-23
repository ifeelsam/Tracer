/**
 * Shared LLM instrumentation keeps payload shaping and session event handling consistent.
 * Provider-specific wrappers only need to route calls into this helper with the raw args.
 */
import type { LLMCallPayload } from "@tracerlabs/shared"

import { getCurrentSession } from "../context"

type GenericRecord = Record<string, unknown>

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null
}

function extractMessages(args: GenericRecord): unknown[] {
  if (Array.isArray(args.messages)) {
    return args.messages
  }

  if (Array.isArray(args.input)) {
    return args.input
  }

  return []
}

function extractSystemPrompt(args: GenericRecord): string | null {
  if (typeof args.system === "string") {
    return args.system
  }

  if (typeof args.instructions === "string") {
    return args.instructions
  }

  const messages = extractMessages(args)
  const systemMessage = messages.find((message) => {
    return isRecord(message) && message.role === "system" && typeof message.content === "string"
  })

  return isRecord(systemMessage) && typeof systemMessage.content === "string"
    ? systemMessage.content
    : null
}

function extractPrompt(args: GenericRecord): string | null {
  if (typeof args.prompt === "string") {
    return args.prompt
  }

  if (typeof args.input === "string") {
    return args.input
  }

  const messages = extractMessages(args)
  const promptParts = messages.flatMap((message) => {
    if (!isRecord(message)) {
      return []
    }

    if (typeof message.content === "string") {
      return [message.content]
    }

    if (Array.isArray(message.content)) {
      return message.content.flatMap((part) => {
        if (isRecord(part) && typeof part.text === "string") {
          return [part.text]
        }

        return []
      })
    }

    return []
  })

  return promptParts.length > 0 ? promptParts.join("\n") : null
}

function extractModel(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.model === "string" ? value.model : fallback
}

function extractUsage(value: unknown): {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
} {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    }
  }

  const usage = value.usage
  const inputTokens =
    typeof usage.input_tokens === "number"
      ? usage.input_tokens
      : typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : null
  const outputTokens =
    typeof usage.output_tokens === "number"
      ? usage.output_tokens
      : typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : null
  const totalTokens =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : inputTokens !== null && outputTokens !== null
        ? inputTokens + outputTokens
        : null

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  }
}

function buildPayload(provider: string, args: GenericRecord): LLMCallPayload {
  return {
    provider,
    model: typeof args.model === "string" ? args.model : "unknown",
    systemPrompt: extractSystemPrompt(args),
    prompt: extractPrompt(args),
    messages: extractMessages(args),
    response: null,
    reasoning:
      typeof args.reasoning === "string"
        ? args.reasoning
        : isRecord(args.reasoning)
          ? JSON.stringify(args.reasoning)
          : null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    latencyMs: null,
    metadata: {
      maxTokens:
        typeof args.max_tokens === "number"
          ? args.max_tokens
          : typeof args.maxTokens === "number"
            ? args.maxTokens
            : null,
      temperature: typeof args.temperature === "number" ? args.temperature : null,
    },
  }
}

export async function withLlmInstrumentation<T>(
  provider: string,
  args: unknown,
  invoke: () => Promise<T>
): Promise<T> {
  const session = getCurrentSession()
  if (!session || !isRecord(args)) {
    return invoke()
  }

  const payload = buildPayload(provider, args)
  const event = session.beginEvent("llm_call", payload)
  const startedAt = Date.now()

  try {
    const result = await invoke()
    const usage = extractUsage(result)
    event.complete({
      ...payload,
      model: extractModel(result, payload.model),
      response: result,
      latencyMs: Date.now() - startedAt,
      ...usage,
    })
    return result
  } catch (error) {
    event.fail(error, {
      ...payload,
      latencyMs: Date.now() - startedAt,
    })
    throw error
  }
}
