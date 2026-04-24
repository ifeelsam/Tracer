/**
 * KeeperHub API client for Tracer.
 * We use it to trigger reliable onchain execution paths and record auditable metadata.
 */

const KEEPERHUB_BASE_URL = "https://app.keeperhub.com/api"

export type KeeperHubAuthMode = "authorization_bearer" | "x_api_key"

function getKeeperHubKey(): string | null {
  const key = process.env.KEEPERHUB_API_KEY
  if (!key || key.trim().length === 0) {
    return null
  }
  return key.trim()
}

export function getKeeperHubAuthMode(key: string): KeeperHubAuthMode {
  // Docs show both styles. Support both defensively.
  return key.startsWith("keeper_") ? "x_api_key" : "authorization_bearer"
}

export async function keeperHubRequest<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const key = getKeeperHubKey()
  if (!key) {
    throw new Error("KeeperHub API key is not configured (KEEPERHUB_API_KEY).")
  }

  const authMode = getKeeperHubAuthMode(key)
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {}),
  }

  if (authMode === "x_api_key") {
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
    signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
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
  return keeperHubRequest<KeeperHubDirectContractCallResponse>("/execute/contract-call", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  })
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
    timeoutMs: 10_000,
  })
}
