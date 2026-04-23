/**
 * Privy token verification is centralized here so protected routes share one auth path.
 * The helper only returns the authenticated user id, keeping route handlers intentionally small.
 */
import { PrivyClient } from "@privy-io/server-auth"

let privyClient: PrivyClient | null = null

function getPrivyClient(): PrivyClient {
  if (privyClient) {
    return privyClient
  }

  const appId = process.env.PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("Privy server auth is not configured")
  }

  privyClient = new PrivyClient(appId, appSecret)
  return privyClient
}

export async function authenticatePrivyToken(
  authorizationHeader: string | undefined
): Promise<string | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null
  }

  const token = authorizationHeader.slice("Bearer ".length)
  if (!token) {
    return null
  }

  try {
    const claims = await getPrivyClient().verifyAuthToken(token)
    return claims.userId
  } catch {
    return null
  }
}
