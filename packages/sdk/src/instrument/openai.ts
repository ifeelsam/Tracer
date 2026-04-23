/**
 * OpenAI instrumentation traces chat completions and responses API calls through lightweight proxies.
 * The wrapper preserves the original client shape so existing agent code doesn't need to change.
 */
import { withLlmInstrumentation } from "./llm-shared"

type GenericRecord = Record<string, unknown>

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null
}

function wrapCreateMethod(value: unknown, provider: string, target: object): unknown {
  if (typeof value !== "function") {
    return value
  }

  return async (args: unknown) => {
    return withLlmInstrumentation(provider, args, async () => {
      return Reflect.apply(value, target, [args])
    })
  }
}

export function wrapOpenAIClient<T extends GenericRecord>(client: T): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (property === "chat" && isRecord(value)) {
        return new Proxy(value, {
          get(chatTarget, chatProperty, chatReceiver) {
            const chatValue = Reflect.get(chatTarget, chatProperty, chatReceiver)
            if (chatProperty === "completions" && isRecord(chatValue)) {
              return new Proxy(chatValue, {
                get(completionsTarget, completionsProperty, completionsReceiver) {
                  const completionValue = Reflect.get(
                    completionsTarget,
                    completionsProperty,
                    completionsReceiver
                  )
                  if (completionsProperty === "create") {
                    return wrapCreateMethod(completionValue, "openai", completionsTarget)
                  }

                  return completionValue
                },
              })
            }

            return chatValue
          },
        })
      }

      if (property === "responses" && isRecord(value)) {
        return new Proxy(value, {
          get(responsesTarget, responsesProperty, responsesReceiver) {
            const responsesValue = Reflect.get(
              responsesTarget,
              responsesProperty,
              responsesReceiver
            )
            if (responsesProperty === "create") {
              return wrapCreateMethod(responsesValue, "openai", responsesTarget)
            }

            return responsesValue
          },
        })
      }

      return value
    },
  })
}
