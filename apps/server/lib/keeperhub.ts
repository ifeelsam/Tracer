/**
 * KeeperHub API client for Tracer.
 * We use it to trigger reliable onchain execution paths and record auditable metadata.
 */

const KEEPERHUB_BASE_URL = "https://app.keeperhub.com/api"

export type KeeperHubAuthMode = "authorization_bearer" | "x_api_key"
export type KeeperHubApiIntent = "direct_execution" | "workflow_webhook" | "general_api"

interface KeeperHubAuthSelection {
  mode: KeeperHubAuthMode
  key: string
}

function readEnvKey(name: string): string | null {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    return null
  }
  return value.trim()
}

function explainMissingKey(intent: KeeperHubApiIntent): string {
  if (intent === "workflow_webhook") {
    return [
      "KeeperHub webhook key is not configured.",
      "Set KEEPERHUB_WEBHOOK_API_KEY to a wfb_ key.",
      "You can also set KEEPERHUB_API_KEY if it already contains a wfb_ key.",
    ].join(" ")
  }
  return [
    "KeeperHub API key is not configured for direct/general requests.",
    "Set KEEPERHUB_API_KEY to a kh_ organization key (preferred) or a legacy direct key.",
  ].join(" ")
}

function ensureValidKeyForIntent(key: string, intent: KeeperHubApiIntent): void {
  if (intent === "workflow_webhook" && !key.startsWith("wfb_")) {
    throw new Error(
      `KeeperHub webhook requests require a wfb_ key, received '${key.slice(0, 5)}...'.`
    )
  }
  if (intent !== "workflow_webhook" && key.startsWith("wfb_")) {
    throw new Error(
      "wfb_ keys are webhook-only. Use KEEPERHUB_API_KEY with a kh_ key for direct/general requests."
    )
  }
}

function resolveAuthSelection(intent: KeeperHubApiIntent): KeeperHubAuthSelection {
  if (intent === "workflow_webhook") {
    const key = readEnvKey("KEEPERHUB_WEBHOOK_API_KEY") ?? readEnvKey("KEEPERHUB_API_KEY")
    if (!key) {
      throw new Error(explainMissingKey(intent))
    }
    ensureValidKeyForIntent(key, intent)
    return { mode: "authorization_bearer", key }
  }

  const key = readEnvKey("KEEPERHUB_API_KEY")
  if (!key) {
    throw new Error(explainMissingKey(intent))
  }
  ensureValidKeyForIntent(key, intent)

  // Current KeeperHub docs show kh_ as bearer and some legacy direct keys over X-API-Key.
  if (key.startsWith("kh_")) {
    return { mode: "authorization_bearer", key }
  }
  if (key.startsWith("keeper_")) {
    return { mode: "x_api_key", key }
  }
  if (key.startsWith("wfb_")) {
    throw new Error(
      "wfb_ keys cannot be used for direct execution/status endpoints. Use a kh_ or legacy direct key."
    )
  }

  const explicitHeader = readEnvKey("KEEPERHUB_DIRECT_AUTH_HEADER")?.toLowerCase()
  if (explicitHeader === "x-api-key") {
    return { mode: "x_api_key", key }
  }
  return { mode: "authorization_bearer", key }
}

export async function keeperHubRequest<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; intent?: KeeperHubApiIntent } = {}
): Promise<T> {
  const intent = init.intent ?? "general_api"
  const { mode, key } = resolveAuthSelection(intent)
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {}),
  }

  if (mode === "x_api_key") {
    headers["x-api-key"] = key
  } else {
    headers.authorization = `Bearer ${key}`
  }

  const response = await fetch(`${KEEPERHUB_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ? (init.headers as Record<string, string>) : {}),
    },
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`KeeperHub API error (${response.status}): ${body || response.statusText}`)
  }

  return (await response.json()) as T
}

export interface KeeperHubDirectContractCallRequest {
  contractAddress: string
  network: string
  functionName: string
  functionArgs?: string
  abi?: string
  value?: string
  gasLimitMultiplier?: string
}

export type KeeperHubDirectContractCallResponse =
  | { result: unknown }
  | { executionId: string; status: "completed" | "failed" }

export async function keeperHubDirectContractCall(
  body: KeeperHubDirectContractCallRequest
): Promise<KeeperHubDirectContractCallResponse> {
  try {
    return await keeperHubRequest<KeeperHubDirectContractCallResponse>("/execute/contract-call", {
      method: "POST",
      body: JSON.stringify(body),
      intent: "direct_execution",
      timeoutMs: 60_000,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        "KeeperHub request timed out after 60s. Retry or switch to a simpler read call for connectivity checks."
      )
    }
    throw error
  }
}

export interface KeeperHubDirectExecutionStatus {
  executionId: string
  status: "pending" | "running" | "completed" | "failed"
  type?: string
  transactionHash?: string
  transactionLink?: string
  gasUsedWei?: string
  result?: unknown
  error?: unknown
  createdAt?: string
  completedAt?: string
}

export async function keeperHubGetDirectExecutionStatus(
  executionId: string
): Promise<KeeperHubDirectExecutionStatus> {
  return keeperHubRequest<KeeperHubDirectExecutionStatus>(`/execute/${executionId}/status`, {
    method: "GET",
    intent: "direct_execution",
    timeoutMs: 10_000,
  })
}

export interface KeeperHubWorkflowWebhookResponse {
  executionId?: string
  status?: string
  [key: string]: unknown
}

export async function keeperHubTriggerWorkflowWebhook(args: {
  workflowId: string
  payload: Record<string, unknown>
}): Promise<KeeperHubWorkflowWebhookResponse> {
  return keeperHubRequest<KeeperHubWorkflowWebhookResponse>(
    `/workflows/${encodeURIComponent(args.workflowId)}/webhook`,
    {
      method: "POST",
      body: JSON.stringify(args.payload),
      intent: "workflow_webhook",
      timeoutMs: 20_000,
    }
  )
}
