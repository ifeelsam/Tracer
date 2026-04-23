/**
 * The Tracer client owns SDK configuration, buffering, and session creation.
 * Framework-specific wrappers are added incrementally but always degrade to safe no-ops.
 */
import { TraceBuffer } from "./buffer"
import { wrapAnthropicClient } from "./instrument/anthropic"
import { wrapPublicClient, wrapWalletClient } from "./instrument/evm"
import { TracerCallbackHandler } from "./instrument/langchain"
import { wrapOllamaClient } from "./instrument/ollama"
import { wrapOpenAIClient } from "./instrument/openai"
import { wrapLanguageModel } from "./instrument/vercel-ai"
import { Session } from "./session"
import type { SessionStartOptions, TracerConfig } from "./types"

export class Tracer {
  private readonly config: TracerConfig
  private readonly buffer: TraceBuffer

  constructor(config: TracerConfig) {
    this.config = {
      ...config,
      endpoint: config.endpoint ?? "https://ingest.tracer.dev",
      bufferMs: config.bufferMs ?? 250,
      bufferBytes: config.bufferBytes ?? 102_400,
      privateMode: config.privateMode ?? false,
      captureMarket: config.captureMarket ?? false,
    }
    this.buffer = new TraceBuffer(this.config)
  }

  async startSession(options: SessionStartOptions): Promise<Session> {
    return new Session(this.config, this.buffer, options)
  }

  wrapOpenAI<T>(client: T): T {
    return wrapOpenAIClient(client as Record<string, unknown>) as T
  }

  wrapAnthropic<T>(client: T): T {
    return wrapAnthropicClient(client as Record<string, unknown>) as T
  }

  wrapOllama<T>(client: T): T {
    return wrapOllamaClient(client as Record<string, unknown>) as T
  }

  wrapTools<T>(tools: T): T {
    return tools
  }

  wrapLanguageModel<T>(model: T): T {
    return wrapLanguageModel(model as Record<string, unknown>) as T
  }

  langchainHandler(): TracerCallbackHandler {
    return new TracerCallbackHandler()
  }

  wrapWalletClient<T>(client: T): T {
    return wrapWalletClient(client as Record<string, unknown>) as T
  }

  wrapPublicClient<T>(client: T): T {
    return wrapPublicClient(client as Record<string, unknown>) as T
  }
}
