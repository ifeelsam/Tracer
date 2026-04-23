/**
 * The LLM abstraction keeps trace analysis provider-neutral and env-driven at runtime.
 * It exposes one small JSON-oriented interface so the analysis worker does not care which client backs it.
 */
export interface GenerateJsonInput {
  system: string
  user: string
}

export interface LLMClient {
  provider: "anthropic" | "ollama"
  model: string
  generateJson<T>(input: GenerateJsonInput): Promise<T>
}

function extractJson<T>(content: string): T {
  return JSON.parse(content) as T
}

function ensureAnthropicConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL
  if (!apiKey || !model) {
    throw new Error("Anthropic configuration is incomplete")
  }

  return { apiKey, model }
}

function ensureOllamaConfig() {
  const host = process.env.OLLAMA_HOST ?? "https://ollama.com"
  const apiKey = process.env.OLLAMA_API_KEY
  const model = process.env.OLLAMA_MODEL
  if (!apiKey || !model) {
    throw new Error("Ollama configuration is incomplete")
  }

  return { host, apiKey, model }
}

class AnthropicLLMClient implements LLMClient {
  readonly provider = "anthropic" as const
  readonly model: string
  private readonly apiKey: string

  constructor() {
    const config = ensureAnthropicConfig()
    this.apiKey = config.apiKey
    this.model = config.model
  }

  async generateJson<T>(input: GenerateJsonInput): Promise<T> {
    const { Anthropic } = await import("@anthropic-ai/sdk")
    const client = new Anthropic({
      apiKey: this.apiKey,
    })

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2_000,
      system: input.system,
      messages: [
        {
          role: "user",
          content: input.user,
        },
      ],
    })

    const text = response.content.flatMap((block) => ("text" in block ? [block.text] : [])).join("")

    return extractJson<T>(text)
  }
}

class OllamaLLMClient implements LLMClient {
  readonly provider = "ollama" as const
  readonly model: string
  private readonly host: string
  private readonly apiKey: string

  constructor() {
    const config = ensureOllamaConfig()
    this.host = config.host
    this.apiKey = config.apiKey
    this.model = config.model
  }

  async generateJson<T>(input: GenerateJsonInput): Promise<T> {
    const { Ollama } = await import("ollama")
    const client = new Ollama({
      host: this.host,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    const response = await client.chat({
      model: this.model,
      format: "json",
      messages: [
        {
          role: "system",
          content: input.system,
        },
        {
          role: "user",
          content: input.user,
        },
      ],
    })

    return extractJson<T>(response.message.content)
  }
}

export function getLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER ?? "ollama"
  if (provider === "anthropic") {
    return new AnthropicLLMClient()
  }

  return new OllamaLLMClient()
}
