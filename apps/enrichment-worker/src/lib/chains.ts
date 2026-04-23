/**
 * Public viem clients are cached per chain so webhook bursts don't recreate transports on every event.
 * RPC selection stays env-driven via the shared chain registry rather than chain-specific conditionals.
 */
import { getChain } from "@tracerlabs/shared"
import { http, createPublicClient } from "viem"

const publicClientCache = new Map<number, ReturnType<typeof createPublicClient>>()

export function getRpcUrl(chainId: number): string {
  const chain = getChain(chainId)
  const envValue = process.env[chain.rpcEnvVar]
  if (envValue) {
    return envValue
  }

  const defaultRpcUrl = chain.viemChain.rpcUrls.default.http[0]
  if (defaultRpcUrl) {
    return defaultRpcUrl
  }

  const publicRpcUrl = chain.viemChain.rpcUrls.public?.http[0]
  if (publicRpcUrl) {
    return publicRpcUrl
  }

  throw new Error(`No RPC URL available for chain ${chainId}`)
}

export function getPublicClient(chainId: number) {
  const cached = publicClientCache.get(chainId)
  if (cached) {
    return cached
  }

  const chain = getChain(chainId)
  const client = createPublicClient({
    chain: chain.viemChain,
    transport: http(getRpcUrl(chainId)),
  })
  publicClientCache.set(chainId, client)
  return client
}
