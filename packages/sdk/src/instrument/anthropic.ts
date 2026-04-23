/**
 * Anthropic instrumentation traces message creation calls while preserving the native client API.
 * It relies on generic proxies so the SDK can stay a peer-only integration.
 */
import { withLlmInstrumentation } from "./llm-shared"

type GenericRecord = Record<string, unknown>

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null
}

export function wrapAnthropicClient<T extends GenericRecord>(client: T): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (property === "messages" && isRecord(value)) {
        return new Proxy(value, {
          get(messagesTarget, messagesProperty, messagesReceiver) {
            const messagesValue = Reflect.get(messagesTarget, messagesProperty, messagesReceiver)
            if (messagesProperty !== "create" || typeof messagesValue !== "function") {
              return messagesValue
            }

            return async (args: unknown) => {
              return withLlmInstrumentation("anthropic", args, async () => {
                return Reflect.apply(messagesValue, messagesTarget, [args])
              })
            }
          },
        })
      }

      return value
    },
  })
}
