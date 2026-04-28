/**
 * Public viem clients are cached per chain so webhook bursts don't recreate transports on every event.
 * RPC selection stays env-driven via the shared chain registry rather than chain-specific conditionals.
 */
import { getChain } from "@tracerlabs/shared"
import { http, createPublicClient, fallback } from "viem"

const publicClientCache = new Map<number, ReturnType<typeof createPublicClient>>()

export function getRpcUrls(chainId: number): string[] {
  const chain = getChain(chainId)
  const urls: string[] = []
  const envPrimary = process.env[chain.rpcEnvVar]
  if (envPrimary) {
    urls.push(envPrimary)
  }

  const envFallbacks = (process.env[`${chain.rpcEnvVar}_FALLBACKS`] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  urls.push(...envFallbacks)

  const defaultRpcUrl = chain.viemChain.rpcUrls.default.http[0]
  if (defaultRpcUrl) {
    urls.push(defaultRpcUrl)
  }

  const publicRpcUrl = chain.viemChain.rpcUrls.public?.http[0]
  if (publicRpcUrl) {
    urls.push(publicRpcUrl)
  }

  const deduped = [...new Set(urls)]
  if (deduped.length === 0) {
    throw new Error(`No RPC URL available for chain ${chainId}`)
  }

  return deduped
}

export function getPublicClient(chainId: number): ReturnType<typeof createPublicClient> {
  const cached = publicClientCache.get(chainId)
  if (cached) {
    return cached
  }

  const chain = getChain(chainId)
  const client = createPublicClient({
    chain: chain.viemChain,
    transport: fallback(
      getRpcUrls(chainId).map((url) =>
        http(url, {
          retryCount: 2,
          timeout: 10_000,
        })
      ),
      { rank: false }
    ),
  })
  publicClientCache.set(chainId, client)
  return client
}
