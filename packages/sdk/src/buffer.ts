/**
 * The trace buffer batches ingest writes so the SDK adds minimal latency to agent execution.
 * Flush failures are swallowed and retried because observability must never break the agent.
 */
import { gzipSync } from "node:zlib"

import type {
  BufferedTraceRecord,
  TraceBatchRequest,
  TracerConfig,
  TracerWarningContext,
} from "./types"

interface TraceBufferOptions {
  agentId: string
  chainId: number
  environment: "testnet" | "mainnet"
  apiKey: string
  endpoint: string
  bufferMs: number
  bufferBytes: number
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

export class TraceBuffer {
  private readonly queue: BufferedTraceRecord[] = []
  private readonly options: TraceBufferOptions
  private readonly bytesPerItem = new WeakMap<BufferedTraceRecord, number>()
  private readonly pendingFlushDelaysMs = [0, 250, 500]
  private flushTimer: NodeJS.Timeout | undefined
  private isFlushing = false
  private queuedBytes = 0

  constructor(config: TracerConfig) {
    this.options = {
      agentId: config.agentId,
      chainId: config.chainId,
      environment: config.environment,
      apiKey: config.apiKey,
      endpoint: config.endpoint ?? "https://ingest.tracer.dev",
      bufferMs: config.bufferMs ?? 250,
      bufferBytes: config.bufferBytes ?? 102_400,
    }
  }

  enqueue(record: BufferedTraceRecord): void {
    const sizeBytes = Buffer.byteLength(JSON.stringify(record), "utf8")
    this.bytesPerItem.set(record, sizeBytes)
    this.queue.push(record)
    this.queuedBytes += sizeBytes

    if (this.queuedBytes >= this.options.bufferBytes) {
      void this.flush()
      return
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined
        void this.flush()
      }, this.options.bufferMs)
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) {
      return
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }

    this.isFlushing = true
    const batch = this.queue.splice(0, this.queue.length)
    let batchBytes = 0
    for (const record of batch) {
      batchBytes += this.bytesPerItem.get(record) ?? 0
    }
    this.queuedBytes = Math.max(0, this.queuedBytes - batchBytes)

    try {
      const requestBody: TraceBatchRequest = {
        agentId: this.options.agentId,
        chainId: this.options.chainId,
        environment: this.options.environment,
        traces: batch,
      }

      const serialized = JSON.stringify(requestBody)
      const payload = gzipSync(serialized)
      let delivered = false

      for (const delayMs of this.pendingFlushDelaysMs) {
        if (delayMs > 0) {
          await wait(delayMs)
        }

        try {
          const response = await fetch(`${this.options.endpoint}/v1/traces/batch`, {
            method: "POST",
            headers: {
              "content-encoding": "gzip",
              "content-type": "application/json",
              "x-tracer-api-key": this.options.apiKey,
            },
            body: payload,
            signal: AbortSignal.timeout(5_000),
          })

          if (response.ok) {
            delivered = true
            break
          }
        } catch {}
      }

      if (!delivered) {
        this.requeue(batch)
        this.warn({
          scope: "buffer",
          message: "trace batch flush failed",
        })
      }
    } catch {
      this.requeue(batch)
      this.warn({
        scope: "buffer",
        message: "trace batch serialization failed",
      })
    } finally {
      this.isFlushing = false
      if (this.queue.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = undefined
          void this.flush()
        }, this.options.bufferMs)
      }
    }
  }

  private requeue(batch: BufferedTraceRecord[]): void {
    const batchBytes = batch.reduce(
      (total, record) => total + (this.bytesPerItem.get(record) ?? 0),
      0
    )
    if (this.queuedBytes + batchBytes > this.options.bufferBytes * 4) {
      return
    }

    this.queue.unshift(...batch)
    this.queuedBytes += batchBytes
  }

  private warn(context: TracerWarningContext): void {
    console.warn(`[tracer:${context.scope}] ${context.message}`)
  }
}
