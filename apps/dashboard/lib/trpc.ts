import type { TracerChain } from "@tracerlabs/shared"
/**
 * The dashboard talks to the server app through its tRPC HTTP endpoint rather than duplicating data logic.
 * These helpers keep the transport minimal and env-driven while still consuming the tRPC router surface.
 */
import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client"
import superjson from "superjson"

export function getServerBaseUrl(): string {
  return process.env.NEXT_PUBLIC_TRACER_SERVER_URL ?? "http://localhost:3000"
}

interface TRPCResponse<T> {
  result?: {
    data?: {
      json?: T
    }
  }
  error?: unknown
}

interface BrowserTRPCClient {
  mutation(path: string, input?: unknown): Promise<unknown>
  query(path: string, input?: unknown): Promise<unknown>
}

export async function callTRPCQuery<T>(path: string): Promise<T> {
  const response = await fetch(`${getServerBaseUrl()}/api/trpc/${path}`, {
    method: "GET",
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`)
  }

  const payload = (await response.json()) as TRPCResponse<T>
  if (!payload.result?.data?.json) {
    throw new Error(`Missing tRPC payload for ${path}`)
  }

  return payload.result.data.json
}

export async function getSupportedChains(): Promise<TracerChain[]> {
  return callTRPCQuery<TracerChain[]>("chains.listSupported")
}

export function createBrowserTRPCClient(
  getAccessToken?: () => Promise<string | null>
): BrowserTRPCClient {
  return createTRPCUntypedClient({
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
