/**
 * The Tracer client owns SDK configuration, buffering, and session creation.
 * Framework-specific wrappers are added incrementally but always degrade to safe no-ops.
 */
import { TraceBuffer } from "./buffer"
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
    return client
  }

  wrapAnthropic<T>(client: T): T {
    return client
  }

  wrapOllama<T>(client: T): T {
    return client
  }

  wrapTools<T>(tools: T): T {
    return tools
  }

  wrapLanguageModel<T>(model: T): T {
    return model
  }

  langchainHandler(): Record<string, never> {
    return {}
  }

  wrapWalletClient<T>(client: T): T {
    return client
  }

  wrapPublicClient<T>(client: T): T {
    return client
  }
}
