/**
 * Request auth is centralized here so tRPC routers can consistently resolve the current Privy user.
 * Missing or invalid auth returns null instead of throwing, which keeps public routes easy to support.
 *
 * Important: access tokens are minted for `NEXT_PUBLIC_PRIVY_APP_ID` (the Privy app id wired in the
 * dashboard). If `.env` sets a different `PRIVY_APP_ID`, verification fails with no obvious client
 * error. Prefer the public id when they differ (see resolvePrivyAppId).
 */
import { PrivyClient } from "@privy-io/server-auth"

let privyClient: PrivyClient | null = null

function normalizeEnv(value: string | undefined): string {
  if (!value) {
    return ""
  }
  let t = value.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim()
  }
  return t
}

/**
 * JWT `aud` matches the app id passed to `PrivyProvider`, i.e. NEXT_PUBLIC_PRIVY_APP_ID.
 * Use that first so server verification aligns with tokens from the browser.
 */
function resolvePrivyAppId(): string {
  const publicId = normalizeEnv(process.env.NEXT_PUBLIC_PRIVY_APP_ID)
  const explicitId = normalizeEnv(process.env.PRIVY_APP_ID)
  if (publicId && explicitId && publicId !== explicitId) {
    console.warn(
      "[tracer/auth] PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_APP_ID differ. Using NEXT_PUBLIC_PRIVY_APP_ID for verification (matches JWT aud). Remove or update PRIVY_APP_ID so they match."
    )
  }
  return publicId || explicitId
}

function getPrivyAppSecret(): string {
  return normalizeEnv(process.env.PRIVY_APP_SECRET)
}

function getPrivyClient(): PrivyClient {
  if (privyClient) {
    return privyClient
  }

  const appId = resolvePrivyAppId()
  const appSecret = getPrivyAppSecret()
  if (!appId || !appSecret) {
    throw new Error("Privy configuration is incomplete (app id and PRIVY_APP_SECRET required).")
  }

  privyClient = new PrivyClient(appId, appSecret)
  return privyClient
}

function readBearerToken(request: Request): string | null {
  const raw = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? ""
  const match = /^\s*Bearer\s+(.+)$/i.exec(raw)
  if (!match?.[1]) {
    return null
  }
  return match[1].trim()
}

export async function getRequestUserId(request: Request): Promise<string | null> {
  const token = readBearerToken(request)
  if (!token) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[tracer/auth] No Bearer token on request (Privy session not sent yet?)")
    }
    return null
  }

  const verificationKeyOverride = normalizeEnv(process.env.PRIVY_JWT_VERIFICATION_KEY) || undefined

  try {
    const claims = await getPrivyClient().verifyAuthToken(token, verificationKeyOverride)
    return claims.userId
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[tracer/auth] verifyAuthToken failed:",
        error instanceof Error ? error.message : error
      )
    }
    return null
  }
}
