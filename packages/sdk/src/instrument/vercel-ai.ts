/**
 * Vercel AI SDK models expose low-level generation methods that are easy to proxy generically.
 * This wrapper instruments those calls without depending on the concrete provider implementation.
 */
import { withLlmInstrumentation } from "./llm-shared"

type GenericRecord = Record<string, unknown>

export function wrapLanguageModel<T extends GenericRecord>(model: T): T {
  return new Proxy(model, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if ((property !== "doGenerate" && property !== "doStream") || typeof value !== "function") {
        return value
      }

      return async (args: unknown) => {
        return withLlmInstrumentation("vercel-ai", args, async () => {
          return Reflect.apply(value, target, [args])
        })
      }
    },
  })
}
