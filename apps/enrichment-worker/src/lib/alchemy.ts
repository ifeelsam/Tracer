/**
 * The webhook payload helpers normalize Alchemy activity notifications into transaction hashes.
 * The worker only depends on hashes and leaves provider-specific payload details at the edge.
 */
import { readFileSync } from "node:fs"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readSecret(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`]
  if (filePath) {
    return readFileSync(filePath, "utf8").trim()
  }

  return process.env[name]
}

export function getExpectedWebhookToken(): string | undefined {
  return readSecret("ALCHEMY_WEBHOOK_AUTH_TOKEN")
}

export function isAuthorizedWebhook(headers: Record<string, unknown>): boolean {
  const expectedToken = getExpectedWebhookToken()
  if (!expectedToken) {
    return false
  }

  const headerCandidates = [
    headers.authorization,
    headers["x-alchemy-token"],
    headers["x-alchemy-signature"],
  ]

  return headerCandidates.some((candidate) => {
    if (typeof candidate !== "string") {
      return false
    }

    return candidate === expectedToken || candidate === `Bearer ${expectedToken}`
  })
}

export function extractWebhookHashes(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return []
  }

  const event = payload.event
  if (!isRecord(event)) {
    return []
  }

  const activity = Array.isArray(event.activity) ? event.activity : []
  return activity.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    if (typeof item.hash === "string") {
      return [item.hash.toLowerCase()]
    }

    return []
  })
}
