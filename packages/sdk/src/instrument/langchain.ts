/**
 * The LangChain callback handler bridges chain events into the Tracer session lifecycle.
 * It keeps per-run event builders so overlapping LLM and tool calls stay correctly paired.
 */
import { getCurrentSession } from "../context"
import type { EventBuilder } from "../event-builder"

function normalizeRunId(runId: unknown): string {
  if (typeof runId === "string") {
    return runId
  }

  if (typeof runId === "number" || typeof runId === "bigint") {
    return String(runId)
  }

  return crypto.randomUUID()
}

function getModelName(serialized: unknown, invocationParams: unknown): string {
  if (
    invocationParams &&
    typeof invocationParams === "object" &&
    "model" in invocationParams &&
    typeof invocationParams.model === "string"
  ) {
    return invocationParams.model
  }

  if (
    serialized &&
    typeof serialized === "object" &&
    "name" in serialized &&
    typeof serialized.name === "string"
  ) {
    return serialized.name
  }

  return "langchain"
}

export class TracerCallbackHandler {
  private readonly llmEvents = new Map<string, EventBuilder>()
  private readonly toolEvents = new Map<string, EventBuilder>()

  handleLLMStart(
    serialized: unknown,
    prompts: string[],
    runId: unknown,
    _parentRunId?: unknown,
    extraParams?: { invocation_params?: unknown }
  ): void {
    const session = getCurrentSession()
    if (!session) {
      return
    }

    const key = normalizeRunId(runId)
    const event = session.beginEvent("llm_call", {
      provider: "langchain",
      model: getModelName(serialized, extraParams?.invocation_params),
      systemPrompt: null,
      prompt: prompts.join("\n"),
      messages: prompts,
      response: null,
      reasoning: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      costUsd: null,
      latencyMs: null,
      metadata: null,
    })
    this.llmEvents.set(key, event)
  }

  handleLLMEnd(output: unknown, runId: unknown): void {
    const key = normalizeRunId(runId)
    const event = this.llmEvents.get(key)
    if (!event) {
      return
    }

    event.complete({
      provider: "langchain",
      model: "langchain",
      systemPrompt: null,
      prompt: null,
      messages: [],
      response: output,
      reasoning: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      costUsd: null,
      latencyMs: null,
      metadata: null,
    })
    this.llmEvents.delete(key)
  }

  handleLLMError(error: unknown, runId: unknown): void {
    const key = normalizeRunId(runId)
    const event = this.llmEvents.get(key)
    if (!event) {
      return
    }

    event.fail(error)
    this.llmEvents.delete(key)
  }

  handleToolStart(serialized: unknown, input: string, runId: unknown): void {
    const session = getCurrentSession()
    if (!session) {
      return
    }

    const key = normalizeRunId(runId)
    const name =
      serialized &&
      typeof serialized === "object" &&
      "name" in serialized &&
      typeof serialized.name === "string"
        ? serialized.name
        : "tool"
    const event = session.beginEvent("tool_call", {
      name,
      input,
      output: null,
    })
    this.toolEvents.set(key, event)
  }

  handleToolEnd(output: unknown, runId: unknown): void {
    const key = normalizeRunId(runId)
    const event = this.toolEvents.get(key)
    if (!event) {
      return
    }

    event.complete({
      name: "tool",
      input: null,
      output,
    })
    this.toolEvents.delete(key)
  }

  handleToolError(error: unknown, runId: unknown): void {
    const key = normalizeRunId(runId)
    const event = this.toolEvents.get(key)
    if (!event) {
      return
    }

    event.fail(error)
    this.toolEvents.delete(key)
  }
}
