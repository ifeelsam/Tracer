/**
 * Request auth is centralized here so tRPC routers can consistently resolve the current Privy user.
 * Missing or invalid auth returns null instead of throwing, which keeps public routes easy to support.
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
    throw new Error("Privy configuration is incomplete")
  }

  privyClient = new PrivyClient(appId, appSecret)
  return privyClient
}

export async function getRequestUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    return null
  }

  try {
    const claims = await getPrivyClient().verifyAuthToken(authorization.slice("Bearer ".length))
    return claims.userId
  } catch {
    return null
  }
}
