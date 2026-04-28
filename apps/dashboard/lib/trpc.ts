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

export async function getSupportedChains(): Promise<TracerChain[]> {
  try {
    return (await createServerTRPCClient().query("chains.listSupported")) as TracerChain[]
  } catch {
    return Object.values(CHAINS)
  }
}

export function createBrowserTRPCClient(
  getAccessToken?: () => Promise<string | null>
): DashboardTRPCClient {
  return createTRPCUntypedClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getServerBaseUrl()}/api/trpc`,
        transformer: superjson,
        headers: async () => {
          const accessToken = await getAccessToken?.()
          if (!accessToken) {
            return {}
          }

          return {
            authorization: `Bearer ${accessToken}`,
          }
        },
      }),
    ],
  })
}
