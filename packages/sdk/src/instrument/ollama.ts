/**
 * Ollama instrumentation traces chat and generate calls for both local and cloud-backed clients.
 * The wrapper is best-effort and leaves unsupported client shapes untouched.
 */
import { withLlmInstrumentation } from "./llm-shared"

type GenericRecord = Record<string, unknown>

export function wrapOllamaClient<T extends GenericRecord>(client: T): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if ((property !== "chat" && property !== "generate") || typeof value !== "function") {
        return value
      }

      return async (args: unknown) => {
        return withLlmInstrumentation("ollama", args, async () => {
          return Reflect.apply(value, target, [args])
        })
      }
    },
  })
}
