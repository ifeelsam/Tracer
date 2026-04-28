/**
 * Alchemy webhook helpers keep tracked agent wallets in sync with the configured Notify webhook.
 * Calls are best-effort and idempotent so agent CRUD does not fail just because webhook sync is down.
 */
import { readFileSync } from "node:fs"

const ALCHEMY_DASHBOARD_API = "https://dashboard.alchemy.com/api"

interface AlchemyWebhookDetails {
  addresses: string[]
}

function getAlchemyConfig() {
  const webhookId = readSecret("ALCHEMY_WEBHOOK_ID")
  const authToken = readSecret("ALCHEMY_WEBHOOK_AUTH_TOKEN")
  if (!webhookId || !authToken) {
    return null
  }

  return {
    webhookId,
    authToken,
  }
}

function readSecret(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`]
  if (filePath) {
    return readFileSync(filePath, "utf8").trim()
  }

  return process.env[name]
}

function normalizeWallet(wallet: string): string {
  return wallet.toLowerCase()
}

async function requestAlchemy(path: string, init: RequestInit): Promise<Response | null> {
  const config = getAlchemyConfig()
  if (!config) {
    return null
  }

  try {
    return await fetch(`${ALCHEMY_DASHBOARD_API}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-alchemy-token": config.authToken,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    return null
  }
}

async function getWebhookDetails(): Promise<AlchemyWebhookDetails | null> {
  const config = getAlchemyConfig()
  if (!config) {
    return null
  }

  const response = await requestAlchemy(`/team-webhooks/${config.webhookId}`, {
    method: "GET",
  })
  if (!response?.ok) {
    return null
  }

  try {
    const payload = (await response.json()) as {
      data?: {
        addresses?: string[]
      }
      addresses?: string[]
    }
    const addresses = payload.data?.addresses ?? payload.addresses ?? []
    return {
      addresses: addresses.map((address) => normalizeWallet(address)),
    }
  } catch {
    return null
  }
}

async function updateWebhookAddresses(
  addressesToAdd: string[],
  addressesToRemove: string[]
): Promise<void> {
  const config = getAlchemyConfig()
  if (!config) {
    return
  }

  const response = await requestAlchemy("/update-webhook-addresses", {
    method: "PUT",
    body: JSON.stringify({
      webhook_id: config.webhookId,
      addresses_to_add: addressesToAdd,
      addresses_to_remove: addressesToRemove,
    }),
  })

  if (!response?.ok) {
    console.warn("[server/alchemy] failed to update webhook addresses")
  }
}

export async function addWalletToAlchemyWebhook(wallet: string, _chainId: number): Promise<void> {
  const normalizedWallet = normalizeWallet(wallet)
  const details = await getWebhookDetails()
  if (!details) {
    return
  }

  if (details.addresses.includes(normalizedWallet)) {
    return
  }

  await updateWebhookAddresses([normalizedWallet], [])
}

export async function removeWalletFromAlchemyWebhook(
  wallet: string,
  _chainId: number
): Promise<void> {
  const normalizedWallet = normalizeWallet(wallet)
  const details = await getWebhookDetails()
  if (!details) {
    return
  }

  if (!details.addresses.includes(normalizedWallet)) {
    return
  }

  await updateWebhookAddresses([], [normalizedWallet])
}
