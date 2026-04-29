import { CHAINS, type TracerChain } from "@tracerlabs/shared/chains"
/**
 * The dashboard talks to the server app through its tRPC HTTP endpoint rather than duplicating data logic.
 * These helpers keep the transport minimal and env-driven while still consuming the tRPC router surface.
 */
import { type TRPCUntypedClient, createTRPCUntypedClient, httpBatchLink } from "@trpc/client"
import superjson from "superjson"

import type { AppRouter } from "../../server/server/routers/_app"

export function getServerBaseUrl(): string {
  return process.env.NEXT_PUBLIC_TRACER_SERVER_URL ?? "http://localhost:3001"
}

type DashboardTRPCClient = TRPCUntypedClient<AppRouter>

export interface SupportedChain {
  id: number
  name: string
  shortName: string
  nativeCurrency: {
    symbol: string
    decimals: number
  }
  blockExplorerUrl: string
  isTestnet: boolean
  rpcEnvVar: string
  alchemyNetwork: string
}

function toSupportedChain(chain: TracerChain): SupportedChain {
  return {
    id: chain.id,
    name: chain.name,
    shortName: chain.shortName,
    nativeCurrency: {
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    blockExplorerUrl: chain.blockExplorerUrl,
    isTestnet: chain.isTestnet,
    rpcEnvVar: chain.rpcEnvVar,
    alchemyNetwork: chain.alchemyNetwork,
  }
}

export function createServerTRPCClient(): DashboardTRPCClient {
  return createTRPCUntypedClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getServerBaseUrl()}/api/trpc`,
        transformer: superjson,
      }),
    ],
  })
}

export async function getSupportedChains(): Promise<SupportedChain[]> {
  try {
    const chains = (await createServerTRPCClient().query("chains.listSupported")) as TracerChain[]
    return chains.map(toSupportedChain)
  } catch {
    return Object.values(CHAINS).map(toSupportedChain)
  }
}

/**
 * Privy can report `ready` + `authenticated` before the access JWT is available (e.g. Base
 * Account / embedded wallet bootstrap). Retry briefly so `Authorization: Bearer` is not sent empty.
 */
async function bearerHeadersFromPrivy(
  getAccessToken?: () => Promise<string | null>
): Promise<Record<string, string>> {
  if (!getAccessToken) {
    return {}
  }
  const maxAttempts = 8
  const delayMs = 100
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const accessToken = await getAccessToken()
    if (accessToken) {
      return { authorization: `Bearer ${accessToken}` }
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs)
      })
    }
  }
  return {}
}

/**
 * Browser tRPC client. Pass Privy's `getAccessToken`; callers should only invoke protected
 * procedures after `usePrivy().ready === true` (see Privy docs). Headers still retry briefly
 * so the JWT can land after wallet SDK init.
 */
export function createBrowserTRPCClient(
  getAccessToken?: () => Promise<string | null>
): DashboardTRPCClient {
  return createTRPCUntypedClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getServerBaseUrl()}/api/trpc`,
        transformer: superjson,
        headers: async () => bearerHeadersFromPrivy(getAccessToken),
      }),
    ],
  })
}
